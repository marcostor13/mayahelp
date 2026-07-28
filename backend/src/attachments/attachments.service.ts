import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Attachment, AttachmentDocument } from './schemas/attachment.schema';
import {
  ALLOWED_MIMETYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  kindForMimetype,
} from './attachment-types';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

@Injectable()
export class AttachmentsService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(
    @InjectModel(Attachment.name)
    private readonly attachmentModel: Model<AttachmentDocument>,
    private readonly configService: ConfigService,
  ) {
    const accountId = this.configService.get<string>('r2.accountId');
    this.bucket = this.configService.get<string>('r2.bucket')!;
    this.publicUrl = (
      this.configService.get<string>('r2.publicUrl') ?? ''
    ).replace(/\/$/, '');

    this.s3 = new S3Client({
      region: 'auto',
      endpoint: accountId
        ? `https://${accountId}.r2.cloudflarestorage.com`
        : undefined,
      credentials: {
        accessKeyId: this.configService.get<string>('r2.accessKeyId') ?? '',
        secretAccessKey:
          this.configService.get<string>('r2.secretAccessKey') ?? '',
      },
    });
  }

  async upload(
    ticketId: string,
    file: Express.Multer.File,
    uploadedBy: string,
    commentId?: string,
  ): Promise<AttachmentDocument> {
    const kind = kindForMimetype(file.mimetype);
    if (!kind) {
      throw new BadRequestException(
        `Tipo de archivo no permitido: ${file.mimetype}. Permitidos: ${Object.keys(ALLOWED_MIMETYPES).join(', ')}`,
      );
    }
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new BadRequestException(
        `El archivo supera el límite de ${MAX_ATTACHMENT_SIZE_BYTES / 1024 / 1024}MB.`,
      );
    }

    const storageKey = `tickets/${ticketId}/${randomUUID()}-${file.originalname}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return this.attachmentModel.create({
      ticket: ticketId,
      commentId: commentId ?? null,
      uploadedBy,
      filename: file.originalname,
      mimetype: file.mimetype,
      kind,
      size: file.size,
      storageKey,
      url: `${this.publicUrl}/${storageKey}`,
    });
  }

  findByTicket(ticketId: string) {
    return this.attachmentModel
      .find({ ticket: ticketId })
      .sort({ createdAt: 1 })
      .exec();
  }

  async remove(id: string, requester: AuthenticatedUser): Promise<void> {
    const attachment = await this.attachmentModel.findById(id).exec();
    if (!attachment) {
      throw new NotFoundException('Adjunto no encontrado');
    }
    const isOwner = attachment.uploadedBy.toString() === requester.userId;
    const canManage =
      requester.role === Role.ADMIN || requester.role === Role.AGENT;
    if (!isOwner && !canManage) {
      throw new ForbiddenException(
        'No tienes permiso para eliminar este adjunto',
      );
    }

    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: attachment.storageKey,
      }),
    );
    await this.attachmentModel.findByIdAndDelete(id).exec();
  }
}
