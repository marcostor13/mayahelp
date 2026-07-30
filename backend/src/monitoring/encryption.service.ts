import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
/** Fixed salt: the derived key must stay stable across restarts to decrypt old rows. */
const SALT = 'mayahelp-connection-secrets';

/**
 * Symmetric encryption for the credentials of monitored deployments (SSH keys, API
 * tokens). Values are stored as `iv.tag.ciphertext` in base64url and are never returned
 * by the API — the connection endpoints only report whether a secret is set.
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer;

  constructor(configService: ConfigService) {
    const secret =
      configService.get<string>('encryptionKey') ||
      configService.get<string>('jwt.accessSecret')!;
    if (!configService.get<string>('encryptionKey')) {
      this.logger.warn(
        'ENCRYPTION_KEY no configurada: las credenciales de monitoreo se cifran con una clave derivada de JWT_ACCESS_SECRET. Definí ENCRYPTION_KEY para poder rotar el JWT sin perderlas.',
      );
    }
    this.key = scryptSync(secret, SALT, KEY_LENGTH);
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  /** Returns null when the value cannot be decrypted (wrong key, tampered row). */
  decrypt(payload: string): string | null {
    try {
      const [ivPart, tagPart, dataPart] = payload.split('.');
      if (!ivPart || !tagPart || !dataPart) return null;
      const decipher = createDecipheriv(
        ALGORITHM,
        this.key,
        Buffer.from(ivPart, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(dataPart, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      this.logger.warn(
        `No se pudo descifrar una credencial: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
