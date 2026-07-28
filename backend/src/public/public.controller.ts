import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { PublicService } from './public.service';
import { CreatePublicObservationDto } from './dto/create-public-observation.dto';
import { Public } from '../common/decorators/public.decorator';
import { MAX_ATTACHMENT_SIZE_BYTES } from '../attachments/attachment-types';

const MAX_PUBLIC_FILES = 5;

@Controller('public/observations')
@Public()
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get(':token')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  getProjectInfo(@Param('token') token: string) {
    return this.publicService.getProjectInfo(token);
  }

  /**
   * Every call here creates a ticket, may create a User, and uploads up to 5 files to
   * R2 — all without authentication. A leaked token is therefore a direct cost and
   * spam vector, so submissions are capped far tighter than the global default.
   */
  @Post(':token')
  @Throttle({ default: { ttl: 600_000, limit: 5 } })
  @UseInterceptors(
    FilesInterceptor('files', MAX_PUBLIC_FILES, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
    }),
  )
  submit(
    @Param('token') token: string,
    @Body() dto: CreatePublicObservationDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.publicService.submitObservation(token, dto, files ?? []);
  }
}
