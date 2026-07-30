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
