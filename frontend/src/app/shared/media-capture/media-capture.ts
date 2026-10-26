import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  OnDestroy,
  Output,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { VideoCompressionError, VideoCompressor, isAbort } from './video-compressor';

type CaptureMode = 'idle' | 'photo' | 'video' | 'audio';
type ActiveMode = Exclude<CaptureMode, 'idle'>;

const VIDEO_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];
const AUDIO_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

/** Formatos de imagen que el backend acepta como adjunto (ver `attachment-types.ts`). */
const PASTEABLE_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
/** Todo lo que el backend acepta como adjunto (ver `attachment-types.ts`). */
const ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
  'audio/webm',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
]);
const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;
/** La grabación se corta antes del límite: el último fragmento todavía suma uno o dos MB. */
const RECORDING_LIMIT_BYTES = MAX_ATTACHMENT_SIZE_BYTES - 3 * 1024 * 1024;
const RECORDING_TIMESLICE_MS = 1000;
const PASTE_NOTICE_MS = 4000;
/** El aviso de un video comprimido trae más texto: que dé tiempo a leerlo. */
const COMPRESSION_NOTICE_MS = 8000;
/** Nombres genéricos con los que el portapapeles entrega una captura de pantalla. */
const GENERIC_CLIPBOARD_NAME = /^(image|imagen|captura|screenshot)(\s*\(\d+\))?\.[a-z0-9]+$/i;

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
  /** `true` mientras se comprime un video: el formulario no debería enviarse sin él. */
  @Output() busyChange = new EventEmitter<boolean>();

  private readonly videoCompressor = inject(VideoCompressor);

  private readonly videoPreview = viewChild<ElementRef<HTMLVideoElement>>('videoPreview');
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly mode = signal<CaptureMode>('idle');
  protected readonly opening = signal(false);
  protected readonly recording = signal(false);
  protected readonly previewReady = signal(false);
  protected readonly elapsedSeconds = signal(0);
  protected readonly error = signal<string | null>(null);
  protected readonly pasteNotice = signal<string | null>(null);
  protected readonly compressing = signal<{ name: string; percent: number } | null>(null);
  protected readonly cameraSupported = !!navigator.mediaDevices?.getUserMedia;
  protected readonly pasteShortcut = /mac|iphone|ipad|ipod/i.test(navigator.userAgent)
    ? '\u2318 + V'
    : 'Ctrl + V';

  private readonly stream = signal<MediaStream | null>(null);
  private mediaRecorder?: MediaRecorder;
  private recordedChunks: Blob[] = [];
  private recordedBytes = 0;
  private recordingCapped = false;
  private timerHandle?: ReturnType<typeof setInterval>;
  private noticeHandle?: ReturnType<typeof setTimeout>;
  private pastedCount = 0;
  private previousBodyOverflow: string | null = null;
  private videoQueue: File[] = [];
  private draining = false;
  private compressionAbort?: AbortController;

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
    this.clearNoticeTimer();
    this.restoreBodyScroll();
    this.videoQueue = [];
    this.compressionAbort?.abort();
  }

  /**
   * Adjunta las imágenes que vengan en el portapapeles (típicamente una captura
   * de pantalla). Escucha en `document` para que el pegado funcione con el foco
   * en cualquier parte del formulario, incluida la caja de descripción.
   */
  @HostListener('document:paste', ['$event'])
  onClipboardPaste(event: ClipboardEvent): void {
    const images = clipboardImages(event.clipboardData);
    if (images.length === 0) return;

    // Sólo interceptamos el pegado cuando el portapapeles trae una imagen: pegar
    // texto en la descripción tiene que seguir funcionando igual que siempre.
    event.preventDefault();

    const tooLarge = images.filter((file) => file.size > MAX_ATTACHMENT_SIZE_BYTES);
    const accepted = images
      .filter((file) => !tooLarge.includes(file) && PASTEABLE_IMAGE_TYPES[file.type])
      .map((file) => this.namedForClipboard(file));
    const unsupported = images.length - accepted.length - tooLarge.length;

    if (tooLarge.length > 0) {
      this.setPasteError('La imagen pegada supera el límite de 25 MB.');
    } else if (unsupported > 0) {
      this.setPasteError('Ese formato de imagen no se puede adjuntar. Usa PNG, JPG, WEBP o GIF.');
    }

    if (accepted.length === 0) return;

    this.error.set(null);
    this.filesAdded.emit(accepted);
    this.showPasteNotice(
      accepted.length === 1
        ? 'Captura pegada desde el portapapeles.'
        : `${accepted.length} imágenes pegadas desde el portapapeles.`,
    );
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.addFiles(Array.from(input.files));
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
          this.addFiles([file]);
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
    this.recordedBytes = 0;
    this.recordingCapped = false;
    try {
      this.mediaRecorder = new MediaRecorder(stream, { mimeType });
    } catch {
      this.error.set('Tu navegador no soporta grabar este tipo de contenido.');
      this.closeCapture();
      return;
    }
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size === 0) return;
      this.recordedChunks.push(event.data);
      this.recordedBytes += event.data.size;
      // Un video de celular pasa los 25 MB en menos de un minuto; cortarlo acá es mejor
      // que dejar grabar y después descartarlo entero.
      if (this.recordedBytes >= RECORDING_LIMIT_BYTES && this.recording()) {
        this.recordingCapped = true;
        this.stopRecording();
      }
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
      this.addFiles([file]);
      if (this.recordingCapped) {
        this.showPasteNotice('La grabación se detuvo al llegar a 25 MB, el límite de un adjunto.');
      }
      this.closeCapture();
    };
    // Con fragmentos cada segundo se puede ir midiendo cuánto pesa lo grabado.
    this.mediaRecorder.start(RECORDING_TIMESLICE_MS);
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

  /** Corta el video que se está comprimiendo; los que esperan en la cola siguen. */
  protected cancelCompression(): void {
    this.compressionAbort?.abort();
  }

  /**
   * Deja pasar solo lo que el backend va a aceptar y dice qué quedó afuera y por qué.
   * Un archivo de más de 25 MB hace que el servidor rechace el envío entero antes de
   * crear nada, y en el formulario público eso se veía como un "no se pudo enviar" sin
   * explicación: la persona reintentaba con el mismo video y volvía a fallar.
   */
  private addFiles(files: File[]): void {
    const oversized = files.filter((file) => file.size > MAX_ATTACHMENT_SIZE_BYTES);
    // Los videos de celular pasan los 25 MB enseguida: esos se comprimen en vez de rechazarse.
    const toCompress = oversized.filter((file) => file.type.startsWith('video/'));
    const tooLarge = oversized.filter((file) => !toCompress.includes(file));
    const unsupported = files.filter(
      (file) => !oversized.includes(file) && !ATTACHMENT_TYPES.has(file.type),
    );
    const accepted = files.filter(
      (file) => !oversized.includes(file) && !unsupported.includes(file),
    );

    const problems = [
      ...tooLarge.map(
        (file) => `"${file.name}" pesa ${megabytes(file.size)} MB y el límite es 25 MB.`,
      ),
      ...unsupported.map((file) => `"${file.name}" tiene un formato que no se puede adjuntar.`),
    ];
    this.error.set(problems.length > 0 ? problems.join(' ') : null);
    if (accepted.length > 0) this.filesAdded.emit(accepted);
    if (toCompress.length > 0) {
      this.videoQueue.push(...toCompress);
      void this.drainVideoQueue();
    }
  }

  /** De a un video por vez: comprimir varios juntos satura el codificador del celular. */
  private async drainVideoQueue(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    this.busyChange.emit(true);
    for (let video = this.videoQueue.shift(); video; video = this.videoQueue.shift()) {
      await this.compressVideo(video);
    }
    this.compressing.set(null);
    this.draining = false;
    this.busyChange.emit(false);
  }

  private async compressVideo(video: File): Promise<void> {
    const abort = new AbortController();
    this.compressionAbort = abort;
    this.compressing.set({ name: video.name, percent: 0 });
    try {
      const { file, audioDropped } = await this.videoCompressor.compress(video, {
        maxBytes: MAX_ATTACHMENT_SIZE_BYTES,
        signal: abort.signal,
        onProgress: (fraction) =>
          this.compressing.set({ name: video.name, percent: Math.floor(fraction * 100) }),
      });
      this.filesAdded.emit([file]);
      this.showPasteNotice(
        `"${video.name}" pesaba ${megabytes(video.size)} MB: lo comprimimos a ` +
          `${megabytes(file.size, Math.round)} MB para poder adjuntarlo.` +
          (audioDropped
            ? ' Quedó sin sonido porque este navegador no pudo procesar el audio.'
            : ''),
        COMPRESSION_NOTICE_MS,
      );
    } catch (err) {
      if (!isAbort(err)) this.addError(compressionErrorMessage(video, err));
    } finally {
      this.compressionAbort = undefined;
    }
  }

  private addError(message: string): void {
    this.error.update((current) => (current ? `${current} ${message}` : message));
  }

  /**
   * El portapapeles entrega las capturas con un nombre genérico ("image.png") o
   * sin nombre, así que les damos uno único: de lo contrario varias capturas del
   * mismo formulario serían indistinguibles en la lista de adjuntos.
   */
  private namedForClipboard(file: File): File {
    if (file.name && !GENERIC_CLIPBOARD_NAME.test(file.name)) return file;
    const extension = PASTEABLE_IMAGE_TYPES[file.type];
    const name = `captura-${Date.now()}-${++this.pastedCount}.${extension}`;
    return new File([file], name, { type: file.type, lastModified: file.lastModified });
  }

  private setPasteError(message: string): void {
    this.pasteNotice.set(null);
    this.clearNoticeTimer();
    this.error.set(message);
  }

  private showPasteNotice(message: string, durationMs = PASTE_NOTICE_MS): void {
    this.clearNoticeTimer();
    this.pasteNotice.set(message);
    this.noticeHandle = setTimeout(() => {
      this.pasteNotice.set(null);
      this.noticeHandle = undefined;
    }, durationMs);
  }

  private clearNoticeTimer(): void {
    if (this.noticeHandle) {
      clearTimeout(this.noticeHandle);
      this.noticeHandle = undefined;
    }
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

/**
 * Redondea hacia arriba: 25,02 MB tiene que leerse como más de 25, no como "25". El peso
 * de un video ya comprimido se redondea normal, igual que en la lista de adjuntos.
 */
function megabytes(bytes: number, round: (value: number) => number = Math.ceil): string {
  const tenths = round((bytes / 1024 / 1024) * 10) / 10;
  return new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(tenths);
}

function compressionErrorMessage(video: File, err: unknown): string {
  const size = `"${video.name}" pesa ${megabytes(video.size)} MB (el límite es 25 MB)`;
  const reason = err instanceof VideoCompressionError ? err.reason : 'failed';
  switch (reason) {
    case 'unsupported':
      return (
        `${size} y este navegador no puede comprimirlo. ` +
        'Ábrelo desde Chrome o Safari actualizados, o recórtalo antes de adjuntarlo.'
      );
    case 'too-long':
      return (
        `${size} y es demasiado largo para comprimirlo sin que se pierda la imagen. ` +
        'Recórtalo o divídelo en partes.'
      );
    default:
      return (
        `${size} y no se pudo comprimir. ` +
        'Recórtalo o grábalo en menor calidad e intenta de nuevo.'
      );
  }
}

/**
 * Extrae los archivos de imagen de un evento de pegado. `items` es la vía que
 * usan todos los navegadores para las capturas de pantalla; `files` queda como
 * respaldo para los que sólo exponen esa lista.
 */
function clipboardImages(clipboard: DataTransfer | null): File[] {
  if (!clipboard) return [];
  const fromItems = Array.from(clipboard.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file);
  const files = fromItems.length > 0 ? fromItems : Array.from(clipboard.files ?? []);
  return files.filter((file) => file.type.startsWith('image/'));
}
