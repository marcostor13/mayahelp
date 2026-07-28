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
  getProjectInfo(@Param('token') token: string) {
    return this.publicService.getProjectInfo(token);
  }

  @Post(':token')
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
