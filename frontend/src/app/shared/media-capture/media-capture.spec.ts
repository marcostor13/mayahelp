import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MediaCapture } from './media-capture';
import {
  CompressedVideo,
  VideoCompressionError,
  VideoCompressionOptions,
  VideoCompressor,
} from './video-compressor';

interface FakeTrack {
  stopped: boolean;
  stop: () => void;
}

/** Cada llamada queda pendiente hasta que el test la resuelve o la rechaza. */
class FakeCompressor {
  readonly calls: {
    file: File;
    options: VideoCompressionOptions;
    resolve: (result: CompressedVideo) => void;
    reject: (err: unknown) => void;
  }[] = [];

  compress(file: File, options: VideoCompressionOptions): Promise<CompressedVideo> {
    return new Promise((resolve, reject) => {
      this.calls.push({ file, options, resolve, reject });
      options.signal?.addEventListener('abort', () =>
        reject(new DOMException('Cancelado', 'AbortError')),
      );
    });
  }
}

function fakeStream(): { stream: MediaStream; track: FakeTrack } {
  const track: FakeTrack = {
    stopped: false,
    stop() {
      this.stopped = true;
    },
  };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  return { stream, track };
}

describe('MediaCapture', () => {
  let fixture: ComponentFixture<MediaCapture>;
  let requests: MediaStreamConstraints[];
  let streams: { stream: MediaStream; track: FakeTrack }[];
  let compressor: FakeCompressor;

  beforeEach(async () => {
    requests = [];
    streams = [];
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: (constraints: MediaStreamConstraints) => {
          requests.push(constraints);
          const created = fakeStream();
          streams.push(created);
          return Promise.resolve(created.stream);
        },
      },
    });

    compressor = new FakeCompressor();
    await TestBed.configureTestingModule({
      imports: [MediaCapture],
      providers: [{ provide: VideoCompressor, useValue: compressor }],
    }).compileComponents();
    fixture = TestBed.createComponent(MediaCapture);
    fixture.detectChanges();
  });

  function preview(): (HTMLVideoElement & { srcObject: MediaStream | null }) | null {
    return fixture.nativeElement.querySelector('video');
  }

  it('shows the live preview after a single tap on "tomar foto"', async () => {
    await fixture.componentInstance.openPhoto();
    await fixture.whenStable();

    expect(requests.length).toBe(1);
    expect(preview()).toBeTruthy();
    expect(preview()!.srcObject).toBe(streams[0].stream);
  });

  it('does not leak the previous camera stream when capture is opened again', async () => {
    await fixture.componentInstance.openPhoto();
    await fixture.whenStable();
    fixture.componentInstance.closeCapture();
    fixture.detectChanges();

    expect(streams[0].track.stopped).toBe(true);

    await fixture.componentInstance.openVideo();
    await fixture.whenStable();

    expect(preview()!.srcObject).toBe(streams[1].stream);
  });

  it('renders the capture view as a fullscreen overlay', async () => {
    await fixture.componentInstance.openPhoto();
    await fixture.whenStable();

    const overlay = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(overlay).toBeTruthy();
    expect(overlay.className).toContain('fixed');
    expect(overlay.className).toContain('inset-0');
    expect(preview()!.className).toContain('h-full');
    expect(preview()!.className).toContain('w-full');
  });

  it('exposes the capture actions as icon-only buttons with accessible labels', () => {
    const actions = Array.from(
      fixture.nativeElement.querySelectorAll('.capture-action'),
    ) as HTMLElement[];

    expect(actions.length).toBe(4);
    for (const action of actions) {
      expect(action.getAttribute('aria-label')).toBeTruthy();
      // Only the icon glyph is rendered — no visible caption next to it.
      const icon = action.querySelector('.material-symbols-outlined') as HTMLElement;
      expect(icon).toBeTruthy();
      expect(action.textContent?.replace(icon.textContent ?? '', '').trim()).toBe('');
    }
  });

  function pasteEvent(files: File[]): ClipboardEvent {
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: {
        items: files.map((file) => ({ kind: 'file', getAsFile: () => file })),
        files,
      },
    });
    return event;
  }

  function screenshot(name = 'image.png', type = 'image/png', size = 1024): File {
    const file = new File([new Uint8Array(1)], name, { type });
    Object.defineProperty(file, 'size', { value: size });
    return file;
  }

  it('emits a screenshot pasted from the clipboard as an attachment', () => {
    const emitted: File[][] = [];
    fixture.componentInstance.filesAdded.subscribe((files) => emitted.push(files));

    const event = pasteEvent([screenshot()]);
    document.dispatchEvent(event);

    expect(emitted.length).toBe(1);
    expect(emitted[0].length).toBe(1);
    expect(emitted[0][0].type).toBe('image/png');
    // The generic clipboard name is replaced so several screenshots stay distinguishable.
    expect(emitted[0][0].name).toMatch(/^captura-\d+-1\.png$/);
    expect(event.defaultPrevented).toBe(true);
  });

  it('gives each pasted screenshot its own name', () => {
    const emitted: File[][] = [];
    fixture.componentInstance.filesAdded.subscribe((files) => emitted.push(files));

    document.dispatchEvent(pasteEvent([screenshot()]));
    document.dispatchEvent(pasteEvent([screenshot()]));

    expect(emitted[0][0].name).not.toBe(emitted[1][0].name);
  });

  it('keeps the real filename when the clipboard carries a named image', () => {
    const emitted: File[][] = [];
    fixture.componentInstance.filesAdded.subscribe((files) => emitted.push(files));

    document.dispatchEvent(pasteEvent([screenshot('diagrama-red.png')]));

    expect(emitted[0][0].name).toBe('diagrama-red.png');
  });

  it('ignores a paste that carries no image, so pasting text still works', () => {
    const emitted: File[][] = [];
    fixture.componentInstance.filesAdded.subscribe((files) => emitted.push(files));

    const event = pasteEvent([screenshot('notas.txt', 'text/plain')]);
    document.dispatchEvent(event);

    expect(emitted.length).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it('rejects a pasted image over the 25MB attachment limit', async () => {
    const emitted: File[][] = [];
    fixture.componentInstance.filesAdded.subscribe((files) => emitted.push(files));

    document.dispatchEvent(pasteEvent([screenshot('image.png', 'image/png', 26 * 1024 * 1024)]));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(emitted.length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('25 MB');
  });

  it('rejects a pasted image in a format the backend does not accept', async () => {
    const emitted: File[][] = [];
    fixture.componentInstance.filesAdded.subscribe((files) => emitted.push(files));

    document.dispatchEvent(pasteEvent([screenshot('image.tiff', 'image/tiff')]));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(emitted.length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('PNG, JPG, WEBP o GIF');
  });

  it('tells the user where to paste a screenshot', () => {
    const hint = fixture.nativeElement.querySelector('.paste-hint') as HTMLElement;

    expect(hint).toBeTruthy();
    expect(hint.textContent).toContain('pega una captura');
  });

  it('keeps the shutter disabled until the preview reports its dimensions', async () => {
    await fixture.componentInstance.openPhoto();
    await fixture.whenStable();

    const shutter = fixture.nativeElement.querySelector('.capture-shutter') as HTMLButtonElement;
    expect(shutter.disabled).toBe(true);

    preview()!.dispatchEvent(new Event('loadedmetadata'));
    await fixture.whenStable();

    expect(shutter.disabled).toBe(false);
  });

  function selectFiles(files: File[]): void {
    const input = { files, value: 'C:\\fakepath\\x' };
    fixture.componentInstance.onFilesSelected({ target: input } as unknown as Event);
  }

  it('rejects a chosen file over the 25MB limit and says which one, keeping the rest', async () => {
    const emitted: File[][] = [];
    fixture.componentInstance.filesAdded.subscribe((files) => emitted.push(files));

    selectFiles([
      screenshot('planos.pdf', 'application/pdf', 31 * 1024 * 1024),
      screenshot('foto-obra.jpg', 'image/jpeg'),
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(emitted.length).toBe(1);
    expect(emitted[0].map((file) => file.name)).toEqual(['foto-obra.jpg']);
    expect(fixture.nativeElement.textContent).toContain('"planos.pdf" pesa 31 MB');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('always tells the user about the 25MB limit and that videos get compressed', () => {
    const hint = fixture.nativeElement.querySelector('.size-limit-hint') as HTMLElement;

    expect(hint.textContent).toContain('25 MB');
    expect(hint.textContent).toContain('se comprimen');
  });

  function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve)).then(() => {
      fixture.detectChanges();
    });
  }

  it('compresses a video over the limit instead of rejecting it', async () => {
    const emitted: File[][] = [];
    const busy: boolean[] = [];
    fixture.componentInstance.filesAdded.subscribe((files) => emitted.push(files));
    fixture.componentInstance.busyChange.subscribe((value) => busy.push(value));

    selectFiles([
      screenshot('video-obra.mov', 'video/quicktime', 48 * 1024 * 1024),
      screenshot('foto-obra.jpg', 'image/jpeg'),
    ]);
    await settle();

    // Lo que ya entra no espera al video.
    expect(emitted.map((files) => files.map((file) => file.name))).toEqual([['foto-obra.jpg']]);
    expect(busy).toEqual([true]);
    expect(compressor.calls.length).toBe(1);
    expect(compressor.calls[0].options.maxBytes).toBe(25 * 1024 * 1024);

    compressor.calls[0].options.onProgress!(0.42);
    fixture.detectChanges();
    const status = fixture.nativeElement.querySelector('.compression-status') as HTMLElement;
    expect(status.textContent).toContain('Comprimiendo "video-obra.mov"… 42%');
    expect(fixture.nativeElement.textContent).not.toContain('pesa 48 MB');

    compressor.calls[0].resolve({
      file: screenshot('video-obra.mp4', 'video/mp4', 21 * 1024 * 1024),
      audioDropped: false,
    });
    await settle();

    expect(emitted[1].map((file) => file.name)).toEqual(['video-obra.mp4']);
    expect(busy).toEqual([true, false]);
    expect(fixture.nativeElement.querySelector('.compression-status')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('pesaba 48 MB: lo comprimimos a 21 MB');
  });

  it('compresses several big videos one after another', async () => {
    const busy: boolean[] = [];
    fixture.componentInstance.busyChange.subscribe((value) => busy.push(value));

    selectFiles([
      screenshot('uno.mp4', 'video/mp4', 30 * 1024 * 1024),
      screenshot('dos.mp4', 'video/mp4', 30 * 1024 * 1024),
    ]);
    await settle();
    expect(compressor.calls.map((call) => call.file.name)).toEqual(['uno.mp4']);

    compressor.calls[0].resolve({ file: screenshot('uno.mp4', 'video/mp4'), audioDropped: false });
    await settle();
    expect(compressor.calls.map((call) => call.file.name)).toEqual(['uno.mp4', 'dos.mp4']);
    expect(busy).toEqual([true]);

    compressor.calls[1].resolve({ file: screenshot('dos.mp4', 'video/mp4'), audioDropped: false });
    await settle();
    expect(busy).toEqual([true, false]);
  });

  it('warns when the compressed video lost its sound', async () => {
    selectFiles([screenshot('video.mp4', 'video/mp4', 30 * 1024 * 1024)]);
    await settle();

    compressor.calls[0].resolve({ file: screenshot('video.mp4', 'video/mp4'), audioDropped: true });
    await settle();

    expect(fixture.nativeElement.textContent).toContain('Quedó sin sonido');
  });

  it('explains why a video could not be compressed', async () => {
    const emitted: File[][] = [];
    const busy: boolean[] = [];
    fixture.componentInstance.filesAdded.subscribe((files) => emitted.push(files));
    fixture.componentInstance.busyChange.subscribe((value) => busy.push(value));

    selectFiles([screenshot('recorrido.mp4', 'video/mp4', 300 * 1024 * 1024)]);
    await settle();
    compressor.calls[0].reject(new VideoCompressionError('too-long'));
    await settle();

    expect(emitted.length).toBe(0);
    expect(busy).toEqual([true, false]);
    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('"recorrido.mp4" pesa 300 MB');
    expect(alert.textContent).toContain('demasiado largo');
  });

  it('says when the browser cannot compress video at all', async () => {
    selectFiles([screenshot('video.mov', 'video/quicktime', 40 * 1024 * 1024)]);
    await settle();
    compressor.calls[0].reject(new VideoCompressionError('unsupported'));
    await settle();

    expect(fixture.nativeElement.textContent).toContain('este navegador no puede comprimirlo');
  });

  it('lets the user cancel a compression without showing an error', async () => {
    const emitted: File[][] = [];
    const busy: boolean[] = [];
    fixture.componentInstance.filesAdded.subscribe((files) => emitted.push(files));
    fixture.componentInstance.busyChange.subscribe((value) => busy.push(value));

    selectFiles([screenshot('video.mp4', 'video/mp4', 40 * 1024 * 1024)]);
    await settle();
    const cancel = fixture.nativeElement.querySelector(
      '.compression-status button',
    ) as HTMLButtonElement;
    cancel.click();
    await settle();

    expect(compressor.calls[0].options.signal!.aborted).toBe(true);
    expect(emitted.length).toBe(0);
    expect(busy).toEqual([true, false]);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('rejects a chosen file in a format the backend does not accept', async () => {
    const emitted: File[][] = [];
    fixture.componentInstance.filesAdded.subscribe((files) => emitted.push(files));

    selectFiles([screenshot('clip.3gp', 'video/3gpp')]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(emitted.length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('"clip.3gp" tiene un formato');
  });

  it('stops a recording before it outgrows the attachment limit', async () => {
    const recorders: FakeRecorder[] = [];
    class FakeRecorder {
      static isTypeSupported = () => true;
      ondataavailable?: (event: { data: Blob }) => void;
      onstop?: () => void;
      timeslice?: number;
      stopped = false;
      constructor() {
        recorders.push(this);
      }
      start(timeslice?: number) {
        this.timeslice = timeslice;
      }
      stop() {
        this.stopped = true;
        // Como el real: el evento `stop` llega después, no dentro de la llamada.
        setTimeout(() => this.onstop?.());
      }
    }
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: FakeRecorder });
    const emitted: File[][] = [];
    fixture.componentInstance.filesAdded.subscribe((files) => emitted.push(files));

    await fixture.componentInstance.openVideo();
    await fixture.whenStable();
    fixture.componentInstance.startRecording();
    // Mide lo grabado de a fragmentos para poder cortar a tiempo.
    expect(recorders[0].timeslice).toBe(1000);

    const chunk = new Blob([new Uint8Array(1)]);
    Object.defineProperty(chunk, 'size', { value: 23 * 1024 * 1024 });
    recorders[0].ondataavailable!({ data: chunk });
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(recorders[0].stopped).toBe(true);
    expect(emitted.length).toBe(1);
    expect(emitted[0][0].type).toBe('video/webm');
    expect(fixture.nativeElement.textContent).toContain('se detuvo al llegar a 25 MB');
  });
});
