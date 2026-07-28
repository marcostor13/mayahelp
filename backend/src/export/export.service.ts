import { Injectable } from '@nestjs/common';
import archiver from 'archiver';
import type { Response } from 'express';
import { TicketsService } from '../tickets/tickets.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { buildTicketMarkdown, MarkdownableTicket } from './markdown-builder';

@Injectable()
export class ExportService {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  async exportOne(
    ticketId: string,
    requester: AuthenticatedUser,
  ): Promise<{ code: string; markdown: string }> {
    const ticket = await this.ticketsService.findById(ticketId, requester);
    const attachments = await this.attachmentsService.findByTicket(ticketId);
    const markdown = buildTicketMarkdown(
      ticket as unknown as MarkdownableTicket,
      attachments,
    );
    return { code: ticket.code, markdown };
  }

  async exportManyToZip(
    ticketIds: string[],
    requester: AuthenticatedUser,
    response: Response,
  ): Promise<void> {
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="tickets-export.zip"',
    );

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(response);

    for (const id of ticketIds) {
      try {
        const { code, markdown } = await this.exportOne(id, requester);
        archive.append(markdown, { name: `${code}.md` });
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : 'Error desconocido';
        archive.append(`No se pudo exportar el ticket ${id}: ${reason}`, {
          name: `${id}-ERROR.txt`,
        });
      }
    }

    await archive.finalize();
  }
}
