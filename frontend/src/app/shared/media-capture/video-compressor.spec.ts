import { TestBed } from '@angular/core/testing';
import { VideoCompressionError, VideoCompressor } from './video-compressor';

describe('VideoCompressor', () => {
  it('reports "unsupported" when the browser has no WebCodecs', async () => {
    const compressor = TestBed.inject(VideoCompressor);
    const video = new File([new Uint8Array(1)], 'video.mp4', { type: 'video/mp4' });

    // jsdom no trae VideoEncoder, igual que un navegador viejo.
    expect(compressor.supported).toBe(false);
    await expect(compressor.compress(video, { maxBytes: 1024 })).rejects.toEqual(
      new VideoCompressionError('unsupported'),
    );
  });
});
