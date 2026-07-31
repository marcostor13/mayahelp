import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Attachment, AttachmentDocument } from './schemas/attachment.schema';
import {
  ALLOWED_MIMETYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  kindForMimetype,
} from './attachment-types';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

/**
 * Vida del link firmado que se escribe en los Markdown de exportación cuando el bucket
 * no tiene dominio público. 7 días es el máximo que admite la firma SigV4 y sobra para
 * que una corrida de Claude Code descargue los adjuntos.
 */
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

/** El redirect del proxy se sigue al instante; la firma no necesita durar más. */
const REDIRECT_SIGNED_URL_TTL_SECONDS = 15 * 60;

/** Sal del HMAC que autentica los links del proxy de adjuntos. */
const FILE_TOKEN_SALT = 'mayahelp-attachment-file';

/** Un adjunto más el link con el que cualquiera puede bajarlo (público o firmado). */
export interface AttachmentWithDownloadUrl {
  filename: string;
  kind: string;
  size: number;
  url: string;
  downloadUrl: string;
}

/**
 * Nombre apto para una key de R2: sin espacios ni acentos, para que la URL resultante
 * sea un link limpio dentro de un Markdown y no haya que confiar en el escapado.
 */
function sanitizeFilename(filename: string): string {
  const ascii = filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[-.]+|-+$/g, '');
  // Las keys largas se truncan por la cola para conservar la extensión.
  return ascii.slice(-120) || 'archivo';
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly endpoint: string;
  private readonly apiUrl: string;
  private readonly tokenSecret: string;

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
    this.endpoint = accountId
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : '';
    // `PUBLIC_API_URL` se configura como el dominio pelado de la API, pero todas las rutas
    // cuelgan del prefijo global `/api` (ver `main.ts`), así que se agrega si falta.
    const apiBase = (
      this.configService.get<string>('publicApiUrl') ?? ''
    ).replace(/\/+$/, '');
    this.apiUrl =
      apiBase && !/\/api$/.test(apiBase) ? `${apiBase}/api` : apiBase;
    this.tokenSecret =
      this.configService.get<string>('encryptionKey') ||
      this.configService.get<string>('jwt.accessSecret') ||
      '';

    if (!this.publicUrl) {
      this.logger.warn(
        this.apiUrl
          ? 'R2_PUBLIC_URL no está configurada: los adjuntos se sirven a través de esta API ' +
              `(${this.apiUrl}/attachments/:id/file), que redirige a un link firmado de R2. ` +
              'Configurala si preferís que el bucket los sirva directo.'
          : 'Ni R2_PUBLIC_URL ni PUBLIC_API_URL están configuradas: los adjuntos solo se pueden ' +
              `compartir con links firmados que expiran en ${SIGNED_URL_TTL_SECONDS / 86400} días.`,
      );
    }

    this.s3 = new S3Client({
      region: 'auto',
      endpoint: this.endpoint || undefined,
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

    const safeName = sanitizeFilename(file.originalname);
    const storageKey = `tickets/${ticketId}/${randomUUID()}-${safeName}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: file.buffer,
        ContentType: file.mimetype,
        // Quien baje el archivo recupera el nombre original, no la key saneada.
        ContentDisposition:
          `inline; filename="${safeName}"; ` +
          `filename*=UTF-8''${encodeURIComponent(file.originalname)}`,
      }),
    );

    // El id se genera acá porque la url del proxy lo lleva adentro.
    const id = new Types.ObjectId();
    return this.attachmentModel.create({
      _id: id,
      ticket: ticketId,
      commentId: commentId ?? null,
      uploadedBy,
      filename: file.originalname,
      mimetype: file.mimetype,
      kind,
      size: file.size,
      storageKey,
      url: this.publicUrl
        ? this.objectUrl(storageKey)
        : (this.proxyUrl(id.toString()) ?? this.objectUrl(storageKey)),
    });
  }

  findByTicket(ticketId: string) {
    return this.attachmentModel
      .find({ ticket: ticketId })
      .sort({ createdAt: 1 })
      .exec();
  }

  /**
   * Lo mismo que `findByTicket`, pero con la `url` resuelta al vuelo: así las miniaturas
   * del front funcionan aunque el bucket no tenga dominio público o la fila se haya
   * guardado antes, cuando la url quedaba incompleta.
   */
  async findByTicketWithLinks(ticketId: string) {
    const attachments = await this.findByTicket(ticketId);
    return Promise.all(
      attachments.map(async (attachment) => ({
        ...attachment.toObject(),
        url: await this.downloadUrl(attachment),
      })),
    );
  }

  /**
   * URL fija del objeto. Si el bucket tiene dominio público es el link que ya sirve para
   * cualquiera; si no, es solo la referencia canónica y hay que firmarla para compartirla.
   */
  private objectUrl(storageKey: string): string {
    const path = storageKey.split('/').map(encodeURIComponent).join('/');
    return this.publicUrl
      ? `${this.publicUrl}/${path}`
      : `${this.endpoint}/${this.bucket}/${path}`;
  }

  /**
   * Link del proxy de esta API: `/attachments/:id/file?t=...`, que redirige a R2 con una
   * firma fresca. Es la alternativa al dominio público del bucket — no expira, así que
   * sirve tanto para las miniaturas del front como para un Markdown que se lee días
   * después. `null` si no se sabe la URL pública de la API.
   */
  private proxyUrl(id: string): string | null {
    if (!this.apiUrl || !this.tokenSecret) return null;
    return `${this.apiUrl}/attachments/${id}/file?t=${this.fileToken(id)}`;
  }

  /** Derivado por adjunto: sin el token, adivinar el id no alcanza para bajar el archivo. */
  private fileToken(id: string): string {
    return createHmac('sha256', this.tokenSecret)
      .update(`${FILE_TOKEN_SALT}:${id}`)
      .digest('base64url');
  }

  /**
   * Link con el que un tercero sin sesión —Claude Code corriendo en GitHub Actions, por
   * ejemplo— puede bajar el archivo. Por orden: el dominio público del bucket, el proxy
   * de esta API, o una firma temporal de R2. Se calcula desde `storageKey`, así que
   * también arregla los adjuntos viejos que quedaron con una `url` incompleta.
   */
  async downloadUrl(attachment: {
    _id?: Types.ObjectId | string;
    storageKey: string;
  }): Promise<string> {
    if (this.publicUrl) return this.objectUrl(attachment.storageKey);

    const proxied = attachment._id
      ? this.proxyUrl(String(attachment._id))
      : null;
    if (proxied) return proxied;

    return this.signedUrl(attachment.storageKey, SIGNED_URL_TTL_SECONDS);
  }

  /** Resuelve el link de descarga de varios adjuntos a la vez, para las exportaciones. */
  async withDownloadUrls(
    attachments: Attachment[],
  ): Promise<AttachmentWithDownloadUrl[]> {
    return Promise.all(
      attachments.map(async (attachment) => ({
        filename: attachment.filename,
        kind: attachment.kind,
        size: attachment.size,
        url: attachment.url,
        downloadUrl: await this.downloadUrl(attachment),
      })),
    );
  }

  /**
   * Resuelve un pedido al proxy: valida el token en tiempo constante y devuelve el link
   * firmado de R2 al que hay que redirigir. Es la única vía sin sesión, así que el token
   * es lo que separa un adjunto de ser público.
   */
  async resolveFileRedirect(id: string, token: string): Promise<string> {
    if (!Types.ObjectId.isValid(id) || !this.isValidFileToken(id, token)) {
      throw new NotFoundException('Adjunto no encontrado');
    }
    const attachment = await this.attachmentModel.findById(id).exec();
    if (!attachment) {
      throw new NotFoundException('Adjunto no encontrado');
    }
    return this.signedUrl(
      attachment.storageKey,
      REDIRECT_SIGNED_URL_TTL_SECONDS,
    );
  }

  private isValidFileToken(id: string, received: string): boolean {
    if (!this.tokenSecret) return false;
    const expected = Buffer.from(this.fileToken(id));
    const actual = Buffer.from(received ?? '');
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private signedUrl(storageKey: string, expiresIn: number): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      { expiresIn },
    );
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
