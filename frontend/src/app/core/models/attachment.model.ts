export type AttachmentKind = 'image' | 'video' | 'audio' | 'document';

export interface Attachment {
  _id: string;
  ticket: string;
  commentId: string | null;
  uploadedBy: string;
  filename: string;
  mimetype: string;
  kind: AttachmentKind;
  size: number;
  url: string;
  createdAt: string;
}
