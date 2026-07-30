import {
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  Output,
  ViewChild,
  signal,
} from '@angular/core';

type CaptureMode = 'idle' | 'photo' | 'video' | 'audio';

const VIDEO_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];
const AUDIO_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

function pickSupportedMimeType(candidates: string[]): string {
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? candidates[candidates.length - 1];
}

@Component({
  selector: 'app-media-capture',
  templateUrl: './media-capture.html',
})
export class MediaCapture implements OnDestroy {
  @Output() filesAdded = new EventEmitter<File[]>();

  @ViewChild('videoPreview') videoPreviewRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  protected readonly mode = signal<CaptureMode>('idle');
  protected readonly recording = signal(false);
  protected readonly elapsedSeconds = signal(0);
  protected readonly error = signal<string | null>(null);
  protected readonly cameraSupported = !!navigator.mediaDevices?.getUserMedia;

  private stream: MediaStream | null = null;
  private mediaRecorder?: MediaRecorder;
  private recordedChunks: Blob[] = [];
  private timerHandle?: ReturnType<typeof setInterval>;

  ngOnDestroy(): void {
    this.stopStream();
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

  async openPhoto(): Promise<void> {
    this.error.set(null);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      this.mode.set('photo');
      queueMicrotask(() => this.attachPreview());
    } catch {
      this.error.set('No se pudo acceder a la cámara. Revisa los permisos del navegador.');
    }
  }

  capturePhoto(): void {
    const video = this.videoPreviewRef?.nativeElement;
    const canvas = this.canvasRef?.nativeElement;
    if (!video || !canvas) return;

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

  async openVideo(): Promise<void> {
    this.error.set(null);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: true,
      });
      this.mode.set('video');
      queueMicrotask(() => this.attachPreview());
    } catch {
      this.error.set('No se pudo acceder a la cámara/micrófono. Revisa los permisos del navegador.');
    }
  }

  async openAudio(): Promise<void> {
    this.error.set(null);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mode.set('audio');
    } catch {
      this.error.set('No se pudo acceder al micrófono. Revisa los permisos del navegador.');
    }
  }

  startRecording(): void {
    if (!this.stream) return;
    const isVideo = this.mode() === 'video';
    const mimeType = pickSupportedMimeType(isVideo ? VIDEO_MIME_CANDIDATES : AUDIO_MIME_CANDIDATES);
    this.recordedChunks = [];
    try {
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
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
    this.clearTimer();
  }

  private attachPreview(): void {
    if (this.videoPreviewRef && this.stream) {
      this.videoPreviewRef.nativeElement.srcObject = this.stream;
    }
  }

  private stopStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private clearTimer(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = undefined;
    }
  }
}
