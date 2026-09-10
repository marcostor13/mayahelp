import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MediaCapture } from './media-capture';

interface FakeTrack {
  stopped: boolean;
  stop: () => void;
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

    await TestBed.configureTestingModule({ imports: [MediaCapture] }).compileComponents();
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
});
