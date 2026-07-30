import { AttachmentKind } from './schemas/attachment.schema';

export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;

export const ALLOWED_MIMETYPES: Record<string, AttachmentKind> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'audio/mpeg': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'audio/mp4': 'audio',
  'audio/webm': 'audio',
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    'document',
  'text/csv': 'document',
  'text/plain': 'document',
};

export function kindForMimetype(mimetype: string): AttachmentKind | null {
  return ALLOWED_MIMETYPES[mimetype] ?? null;
}
