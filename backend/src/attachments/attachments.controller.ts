import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AttachmentsService } from './attachments.service';
import { TicketsService } from '../tickets/tickets.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { MAX_ATTACHMENT_SIZE_BYTES } from './attachment-types';

@Controller()
export class AttachmentsController {
  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly ticketsService: TicketsService,
  ) {}

  @Post('tickets/:ticketId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
    }),
  )
  async upload(
    @Param('ticketId') ticketId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('commentId') commentId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo.');
    }
    await this.ticketsService.findById(ticketId, user);
    return this.attachmentsService.upload(
      ticketId,
      file,
      user.userId,
      commentId,
    );
  }

  @Get('tickets/:ticketId/attachments')
  async listForTicket(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.ticketsService.findById(ticketId, user);
    return this.attachmentsService.findByTicket(ticketId);
  }

  @Delete('attachments/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.attachmentsService.remove(id, user);
  }
}
