import {
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  Output,
  effect,
  signal,
  viewChild,
} from '@angular/core';

type CaptureMode = 'idle' | 'photo' | 'video' | 'audio';
type ActiveMode = Exclude<CaptureMode, 'idle'>;

const VIDEO_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];
const AUDIO_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

const CAPTURE_SETUP: Record<ActiveMode, { constraints: MediaStreamConstraints; error: string }> = {
  photo: {
    constraints: { video: { facingMode: 'environment' } },
    error: 'No se pudo acceder a la cámara. Revisa los permisos del navegador.',
  },
  video: {
    constraints: { video: { facingMode: 'environment' }, audio: true },
    error: 'No se pudo acceder a la cámara/micrófono. Revisa los permisos del navegador.',
  },
  audio: {
    constraints: { audio: true },
    error: 'No se pudo acceder al micrófono. Revisa los permisos del navegador.',
  },
};

function pickSupportedMimeType(candidates: string[]): string {
  return (
    candidates.find((type) => MediaRecorder.isTypeSupported(type)) ??
    candidates[candidates.length - 1]
  );
}

@Component({
  selector: 'app-media-capture',
  templateUrl: './media-capture.html',
})
export class MediaCapture implements OnDestroy {
  @Output() filesAdded = new EventEmitter<File[]>();

  private readonly videoPreview = viewChild<ElementRef<HTMLVideoElement>>('videoPreview');
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly mode = signal<CaptureMode>('idle');
  protected readonly opening = signal(false);
  protected readonly recording = signal(false);
  protected readonly previewReady = signal(false);
  protected readonly elapsedSeconds = signal(0);
  protected readonly error = signal<string | null>(null);
  protected readonly cameraSupported = !!navigator.mediaDevices?.getUserMedia;

  private readonly stream = signal<MediaStream | null>(null);
  private mediaRecorder?: MediaRecorder;
  private recordedChunks: Blob[] = [];
  private timerHandle?: ReturnType<typeof setInterval>;
  private previousBodyOverflow: string | null = null;

  constructor() {
    // The preview <video> lives inside an @if, so it does not exist yet at the
    // moment the stream arrives. Binding from an effect covers both orders —
    // element rendered after the stream, or stream obtained after the element —
    // so the preview shows up on the first tap instead of needing a second one.
    effect(() => {
      const video = this.videoPreview()?.nativeElement;
      const stream = this.stream();
      if (!video) return;
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
      if (stream) {
        // Safari/iOS may not honour the autoplay attribute for a fresh srcObject.
        // play() does not return a promise on every engine, hence the optional call.
        video.play()?.catch(() => undefined);
      }
    });
  }

  ngOnDestroy(): void {
    this.stopStream();
    this.clearTimer();
    this.restoreBodyScroll();
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.filesAdded.emit(Array.from(input.files));
    input.value = '';
  }

  get elapsedLabel(): string {
    const total = this.elapsedSeconds();
    const minutes = Math.floor(total / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (total % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  openPhoto(): Promise<void> {
    return this.openCapture('photo');
  }

  openVideo(): Promise<void> {
    return this.openCapture('video');
  }

  openAudio(): Promise<void> {
    return this.openCapture('audio');
  }

  capturePhoto(): void {
    const video = this.videoPreview()?.nativeElement;
    const canvas = this.canvas()?.nativeElement;
    if (!video || !canvas) return;
    if (!video.videoWidth || !video.videoHeight) {
      this.error.set('La cámara aún no está lista. Intenta de nuevo.');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
          this.filesAdded.emit([file]);
        }
        this.closeCapture();
      },
      'image/jpeg',
      0.9,
    );
  }

  startRecording(): void {
    const stream = this.stream();
    if (!stream) return;
    const isVideo = this.mode() === 'video';
    const mimeType = pickSupportedMimeType(isVideo ? VIDEO_MIME_CANDIDATES : AUDIO_MIME_CANDIDATES);
    this.recordedChunks = [];
    try {
      this.mediaRecorder = new MediaRecorder(stream, { mimeType });
    } catch {
      this.error.set('Tu navegador no soporta grabar este tipo de contenido.');
      this.closeCapture();
      return;
    }
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.recordedChunks.push(event.data);
    };
    this.mediaRecorder.onstop = () => {
      // Strip codec parameters (e.g. "video/webm;codecs=vp9,opus") — only the
      // bare mimetype is meaningful to the backend's upload whitelist.
      const baseMimeType = mimeType.split(';')[0];
      const isMp4 = baseMimeType.includes('mp4');
      const extension = isMp4 ? (isVideo ? 'mp4' : 'm4a') : 'webm';
      const prefix = isVideo ? 'video' : 'audio';
      const blob = new Blob(this.recordedChunks, { type: baseMimeType });
      const file = new File([blob], `${prefix}-${Date.now()}.${extension}`, { type: baseMimeType });
      this.filesAdded.emit([file]);
      this.closeCapture();
    };
    this.mediaRecorder.start();
    this.recording.set(true);
    this.elapsedSeconds.set(0);
    this.timerHandle = setInterval(() => this.elapsedSeconds.update((s) => s + 1), 1000);
  }

  stopRecording(): void {
    this.mediaRecorder?.stop();
    this.recording.set(false);
    this.clearTimer();
  }

  closeCapture(): void {
    if (this.mediaRecorder && this.recording()) {
      this.mediaRecorder.stop();
    }
    this.stopStream();
    this.mode.set('idle');
    this.recording.set(false);
    this.previewReady.set(false);
    this.clearTimer();
    this.restoreBodyScroll();
  }

  protected onPreviewReady(): void {
    this.previewReady.set(true);
  }

  private async openCapture(mode: ActiveMode): Promise<void> {
    if (this.opening()) return;
    this.error.set(null);
    this.previewReady.set(false);
    // Never hold on to a previous stream: overwriting it would leave the camera
    // track running (and the recording light on) with nobody to stop it.
    this.stopStream();
    this.opening.set(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia(CAPTURE_SETUP[mode].constraints);
      this.stream.set(stream);
      this.mode.set(mode);
      this.lockBodyScroll();
    } catch {
      this.error.set(CAPTURE_SETUP[mode].error);
      this.mode.set('idle');
    } finally {
      this.opening.set(false);
    }
  }

  private stopStream(): void {
    this.stream()
      ?.getTracks()
      .forEach((track) => track.stop());
    this.stream.set(null);
  }

  private clearTimer(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = undefined;
    }
  }

  private lockBodyScroll(): void {
    if (this.previousBodyOverflow !== null) return;
    this.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  private restoreBodyScroll(): void {
    if (this.previousBodyOverflow === null) return;
    document.body.style.overflow = this.previousBodyOverflow;
    this.previousBodyOverflow = null;
  }
}
