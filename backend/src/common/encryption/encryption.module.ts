import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';

/**
 * Global so every module that stores third-party credentials (monitoring connections,
 * GitHub tokens) shares one derived key instead of re-deriving it per module.
 */
@Global()
@Module({
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
