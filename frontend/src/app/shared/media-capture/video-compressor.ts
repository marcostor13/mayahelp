import { Injectable } from '@angular/core';

/** Por qué no se pudo comprimir: el componente elige el mensaje para cada caso. */
export type VideoCompressionFailure = 'unsupported' | 'too-long' | 'failed';

export class VideoCompressionError extends Error {
  constructor(readonly reason: VideoCompressionFailure) {
    super(`No se pudo comprimir el video (${reason}).`);
  }
}

export interface CompressedVideo {
  file: File;
  /** El navegador no pudo pasar el audio al MP4 y el video quedó sin sonido. */
  audioDropped: boolean;
}

export interface VideoCompressionOptions {
  /** Peso máximo del resultado. */
  maxBytes: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Margen para el contenedor MP4 y para lo que el codificador se pase del bitrate pedido. */
const SIZE_BUDGET_RATIO = 0.88;
/** Por debajo de esto el video ya no se entiende: mejor pedir que lo recorten. */
const MIN_VIDEO_BITRATE = 250_000;
const MAX_VIDEO_BITRATE = 4_000_000;
const DEFAULT_AUDIO_BITRATE = 128_000;
/** Un audio más pesado que esto (PCM de algunas cámaras) se recodifica a AAC. */
const MAX_COPIED_AUDIO_BITRATE = 256_000;
const MAX_FRAME_RATE = 30;

/**
 * Comprime un video en el navegador hasta que entre en el límite de adjuntos, con
 * WebCodecs vía mediabunny. Se carga recién al primer uso para no sumar peso a la página.
 */
@Injectable({ providedIn: 'root' })
export class VideoCompressor {
  get supported(): boolean {
    return typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined';
  }

  async compress(file: File, options: VideoCompressionOptions): Promise<CompressedVideo> {
    if (!this.supported) throw new VideoCompressionError('unsupported');
    const mb = await import('mediabunny');
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    try {
      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack || !(await videoTrack.canDecode())) {
        throw new VideoCompressionError('unsupported');
      }
      const audioTrack = await input.getPrimaryAudioTrack();
      const duration = await input.computeDuration();
      if (!duration) throw new VideoCompressionError('failed');

      const sourceAudioBitrate = audioTrack
        ? (await audioTrack.computePacketStats(200)).averageBitrate || DEFAULT_AUDIO_BITRATE
        : 0;
      const reencodeAudio =
        sourceAudioBitrate > MAX_COPIED_AUDIO_BITRATE &&
        (await mb.canEncodeAudio('aac', { bitrate: DEFAULT_AUDIO_BITRATE }));
      const audioBitrate = reencodeAudio ? DEFAULT_AUDIO_BITRATE : sourceAudioBitrate;

      const budgetBits = options.maxBytes * 8 * SIZE_BUDGET_RATIO;
      const videoBitrate = Math.min(budgetBits / duration - audioBitrate, MAX_VIDEO_BITRATE);
      if (videoBitrate < MIN_VIDEO_BITRATE) throw new VideoCompressionError('too-long');

      const [width, height] = await Promise.all([
        videoTrack.getDisplayWidth(),
        videoTrack.getDisplayHeight(),
      ]);
      const maxSide = maxSideFor(videoBitrate);
      const scale = Math.min(1, maxSide / Math.max(width, height));
      const outWidth = evenFloor(width * scale);
      const outHeight = evenFloor(height * scale);
      const frameRate = (await videoTrack.computePacketStats(100)).averagePacketRate;

      const quality = await this.pickQuality(mb, videoBitrate, outWidth, outHeight);
      if (!quality) throw new VideoCompressionError('unsupported');

      const output = new mb.Output({
        format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
        target: new mb.BufferTarget(),
      });
      const conversion = await mb.Conversion.init({
        input,
        output,
        tracks: 'primary',
        video: {
          width: outWidth,
          height: outHeight,
          fit: 'fill',
          codec: 'avc',
          quality,
          ...(frameRate > MAX_FRAME_RATE + 1 && { frameRate: MAX_FRAME_RATE }),
        },
        audio: reencodeAudio
          ? { codec: 'aac', quality: new mb.Quality({ bitrate: DEFAULT_AUDIO_BITRATE }) }
          : {},
        showWarnings: false,
      });
      const videoDiscarded = conversion.discardedTracks.some(({ track }) => track.isVideoTrack());
      if (!conversion.isValid || videoDiscarded) throw new VideoCompressionError('unsupported');

      if (options.signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
      const cancel = () => void conversion.cancel();
      options.signal?.addEventListener('abort', cancel, { once: true });
      conversion.onProgress = (progress) => options.onProgress?.(progress);
      try {
        await conversion.execute();
      } catch (err) {
        if (err instanceof mb.ConversionCanceledError) {
          throw new DOMException('Cancelado', 'AbortError');
        }
        throw new VideoCompressionError('failed');
      } finally {
        options.signal?.removeEventListener('abort', cancel);
      }

      const buffer = output.target.buffer;
      if (!buffer) throw new VideoCompressionError('failed');
      if (buffer.byteLength > options.maxBytes) throw new VideoCompressionError('too-long');
      return {
        file: new File([buffer], mp4Name(file.name), { type: 'video/mp4' }),
        audioDropped: conversion.discardedTracks.some(({ track }) => track.isAudioTrack()),
      };
    } catch (err) {
      if (err instanceof VideoCompressionError || isAbort(err)) throw err;
      // Un archivo que mediabunny no sabe leer, o un códec que el navegador no tiene.
      throw new VideoCompressionError('failed');
    } finally {
      input.dispose();
    }
  }

  /**
   * Bitrate constante para que el peso final sea predecible; algunos codificadores
   * por hardware solo aceptan variable, y ahí el margen del presupuesto lo cubre.
   */
  private async pickQuality(
    mb: typeof import('mediabunny'),
    bitrate: number,
    width: number,
    height: number,
  ): Promise<import('mediabunny').Quality | null> {
    for (const bitrateMode of ['constant', 'variable'] as const) {
      const quality = new mb.Quality({ bitrate: Math.round(bitrate), bitrateMode });
      if (await mb.canEncodeVideo('avc', { width, height, quality })) return quality;
    }
    return null;
  }
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** Con menos bitrate, menos píxeles: un 1080p a 500 kbps se ve peor que un 640p. */
function maxSideFor(videoBitrate: number): number {
  if (videoBitrate >= 1_200_000) return 1280;
  if (videoBitrate >= 600_000) return 960;
  return 640;
}

/** H.264 exige dimensiones pares. */
function evenFloor(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function mp4Name(name: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'video';
  return `${base}.mp4`;
}
