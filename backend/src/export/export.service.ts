import { Injectable } from '@nestjs/common';
import archiver from 'archiver';
import type { Response } from 'express';
import { TicketsService } from '../tickets/tickets.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { FilterTicketDto } from '../tickets/dto/filter-ticket.dto';
import {
  buildCombinedMarkdown,
  buildTicketMarkdown,
  MarkdownableTicket,
  TicketWithAttachments,
} from './markdown-builder';

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

  /**
   * One Markdown document with many tickets. Pass explicit `ids` for a selection, or
   * omit them to export every ticket the requester can see under `filter`.
   */
  async exportCombined(
    params: { ids?: string[]; filter?: FilterTicketDto },
    requester: AuthenticatedUser,
  ): Promise<string> {
    const entries = params.ids?.length
      ? await this.collectByIds(params.ids, requester)
      : await this.collectByFilter(params.filter ?? {}, requester);

    return buildCombinedMarkdown(entries, {
      generatedAt: new Date(),
      filterSummary: params.ids?.length
        ? `${entries.length} ticket(s) seleccionados`
        : describeFilter(params.filter ?? {}),
    });
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

  /** Skips ids the requester cannot see instead of failing the whole export. */
  private async collectByIds(
    ids: string[],
    requester: AuthenticatedUser,
  ): Promise<TicketWithAttachments[]> {
    const entries: TicketWithAttachments[] = [];
    for (const id of ids) {
      try {
        const ticket = await this.ticketsService.findById(id, requester);
        const attachments = await this.attachmentsService.findByTicket(id);
        entries.push({
          ticket: ticket as unknown as MarkdownableTicket,
          attachments,
        });
      } catch {
        continue;
      }
    }
    return entries;
  }

  private async collectByFilter(
    filter: FilterTicketDto,
    requester: AuthenticatedUser,
  ): Promise<TicketWithAttachments[]> {
    const tickets = await this.ticketsService.findAllForExport(
      filter,
      requester,
    );
    const entries: TicketWithAttachments[] = [];
    for (const ticket of tickets) {
      const attachments = await this.attachmentsService.findByTicket(ticket.id);
      entries.push({
        ticket: ticket as unknown as MarkdownableTicket,
        attachments,
      });
    }
    return entries;
  }
}

function describeFilter(filter: FilterTicketDto): string {
  const parts: string[] = [];
  if (filter.status) parts.push(`estado=${filter.status}`);
  if (filter.priority) parts.push(`prioridad=${filter.priority}`);
  if (filter.category) parts.push('categoría seleccionada');
  if (filter.project) parts.push('proyecto seleccionado');
  if (filter.assignedAgent) parts.push('agente seleccionado');
  if (filter.unassigned === 'true') parts.push('sin agente asignado');
  if (filter.search) parts.push(`búsqueda="${filter.search}"`);
  return parts.length > 0 ? parts.join(', ') : 'todos los tickets';
}
