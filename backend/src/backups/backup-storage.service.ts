import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'node:fs';

/** Un dump pesa cientos de MB: el link tiene que durar lo suficiente para bajarlo entero. */
const DOWNLOAD_URL_TTL_SECONDS = 6 * 60 * 60;

/**
 * Los `.archive.gz` de los backups en R2. Va aparte de `AttachmentsService` porque puede
 * apuntar a otro bucket (`R2_BACKUPS_BUCKET`): conviene separar los dumps de la base de los
 * adjuntos que se sirven públicos.
 */
@Injectable()
export class BackupStorageService {
  private readonly logger = new Logger(BackupStorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly configured: boolean;

  constructor(configService: ConfigService) {
    const accountId = configService.get<string>('r2.accountId');
    const accessKeyId = configService.get<string>('r2.accessKeyId');
    const secretAccessKey = configService.get<string>('r2.secretAccessKey');
    this.bucket =
      configService.get<string>('r2.backupsBucket') ||
      configService.get<string>('r2.bucket')!;
    this.configured = Boolean(accountId && accessKeyId && secretAccessKey);

    if (!this.configured) {
      this.logger.warn(
        'R2 no está configurada (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY): los backups van a fallar al subir.',
      );
    }

    this.s3 = new S3Client({
      region: 'auto',
      endpoint: accountId
        ? `https://${accountId}.r2.cloudflarestorage.com`
        : undefined,
      credentials: {
        accessKeyId: accessKeyId ?? '',
        secretAccessKey: secretAccessKey ?? '',
      },
    });
  }

  /** Se chequea antes de arrancar el dump: no tiene sentido volcar 2 GB para no poder subirlos. */
  assertConfigured(): void {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'R2 no está configurada en el servidor; no se pueden guardar los backups.',
      );
    }
  }

  /** Sube el archivo por streaming, sin cargarlo entero en memoria. */
  async upload(
    filePath: string,
    storageKey: string,
    sizeBytes: number,
  ): Promise<void> {
    this.assertConfigured();
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: createReadStream(filePath),
        // R2 no acepta un stream sin longitud conocida; ya la sabemos por el `stat` del dump.
        ContentLength: sizeBytes,
        ContentType: 'application/gzip',
        ContentDisposition: `attachment; filename="${storageKey.split('/').pop()}"`,
      }),
    );
  }

  /** Borrar es "mejor esfuerzo": si el objeto ya no está, la fila igual se limpia. */
  async remove(storageKey: string): Promise<void> {
    try {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo borrar ${storageKey} de R2: ${(error as Error).message}`,
      );
    }
  }

  downloadUrl(storageKey: string): Promise<string> {
    this.assertConfigured();
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
    );
  }
}
