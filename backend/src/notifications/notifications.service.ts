import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { WhatsAppService } from './whatsapp.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import {
  NotificationContext,
  resolveVariables,
} from '../app-settings/notification-variables';
import { AppSettingsDocument } from '../app-settings/schemas/app-settings.schema';

export interface NotifyRecipient {
  name: string;
  email: string;
  phone?: string;
}

export interface NotifyTicket {
  _id: string;
  code: string;
  subject: string;
  description?: string;
  status?: string;
  priority?: string;
  categoryName?: string;
  projectName?: string;
}

type NotificationEvent = 'ticketCreated' | 'ticketUpdated' | 'newComment';

interface EmailBody {
  subject: string;
  html: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly appUrl: string;

  constructor(
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsAppService,
    private readonly configService: ConfigService,
    private readonly appSettingsService: AppSettingsService,
  ) {
    this.appUrl = this.configService.get<string>('corsOrigin')!;
  }

  async notifyTicketCreated(
    recipient: NotifyRecipient,
    ticket: NotifyTicket,
  ): Promise<void> {
    const link = this.ticketLink(ticket);
    await this.dispatch('ticketCreated', {
      recipient,
      ticket,
      event: 'Nuevo ticket',
      clientEmail: {
        subject: `Hemos recibido tu ticket ${ticket.code}`,
        html: `<p>Hola ${recipient.name},</p>
       <p>Recibimos tu solicitud "<strong>${ticket.subject}</strong>" (${ticket.code}). Un agente la revisará pronto.</p>
       <p><a href="${link}">Ver el ticket</a></p>`,
      },
      internalEmail: {
        subject: `Nuevo ticket ${ticket.code}: ${ticket.subject}`,
        html: `<p>Entró un nuevo ticket en MayaHelp.</p>
       ${this.ticketSummaryHtml(ticket, recipient)}
       <p><a href="${link}">Abrir el ticket</a></p>`,
      },
    });
  }

  async notifyNewComment(
    recipient: NotifyRecipient,
    ticket: NotifyTicket,
    authorName: string,
    message: string,
  ): Promise<void> {
    const link = this.ticketLink(ticket);
    await this.dispatch('newComment', {
      recipient,
      ticket,
      event: 'Nuevo comentario',
      author: authorName,
      message,
      clientEmail: {
        subject: `Nueva respuesta en tu ticket ${ticket.code}`,
        html: `<p>Hola ${recipient.name},</p>
       <p><strong>${authorName}</strong> respondió en "${ticket.subject}" (${ticket.code}):</p>
       <blockquote>${message}</blockquote>
       <p><a href="${link}">Ver la conversación</a></p>`,
      },
      internalEmail: {
        subject: `Comentario en ${ticket.code}: ${ticket.subject}`,
        html: `<p><strong>${authorName}</strong> comentó en ${ticket.code}:</p>
       <blockquote>${message}</blockquote>
       <p><a href="${link}">Abrir el ticket</a></p>`,
      },
    });
  }

  async notifyStatusChanged(
    recipient: NotifyRecipient,
    ticket: NotifyTicket,
    status: string,
  ): Promise<void> {
    const link = this.ticketLink(ticket);
    await this.dispatch('ticketUpdated', {
      recipient,
      ticket: { ...ticket, status },
      event: `Ticket actualizado a ${status}`,
      clientEmail: {
        subject: `Actualización de tu ticket ${ticket.code}`,
        html: `<p>Hola ${recipient.name},</p>
       <p>Tu ticket "<strong>${ticket.subject}</strong>" (${ticket.code}) cambió de estado a: <strong>${status}</strong>.</p>
       <p><a href="${link}">Ver el ticket</a></p>`,
      },
      internalEmail: {
        subject: `${ticket.code} cambió a ${status}`,
        html: `<p>El ticket ${ticket.code} ("${ticket.subject}") cambió de estado a <strong>${status}</strong>.</p>
       <p><a href="${link}">Abrir el ticket</a></p>`,
      },
    });
  }

  /**
   * Sends a sample notification with the settings as they are saved right now, so an
   * admin can confirm the WhatsApp template and its variables actually work.
   */
  async sendTestNotification(): Promise<{
    whatsapp: { to: string; ok: boolean; error?: string }[];
    email: { to: string; sent: boolean }[];
  }> {
    const settings = await this.appSettingsService.get();
    const ticket: NotifyTicket = {
      _id: '000000000000000000000000',
      code: 'TCK-PRUEBA',
      subject: 'Notificación de prueba de MayaHelp',
      description:
        'Este es un mensaje de prueba enviado desde la configuración de notificaciones.',
      status: 'abierto',
      priority: 'media',
      categoryName: 'Prueba',
      projectName: 'Prueba',
    };
    const context = this.buildContext({
      ticket,
      event: 'Prueba de configuración',
      recipientName: 'Equipo MayaHelp',
      clientName: 'Cliente de prueba',
      clientEmail: 'cliente@ejemplo.com',
    });

    const whatsapp: { to: string; ok: boolean; error?: string }[] = [];
    for (const phone of settings.whatsapp.recipients) {
      const result = await this.whatsappService.sendTemplate(
        phone,
        resolveVariables(settings.whatsapp.variables, context),
        {
          name: settings.whatsapp.templateName,
          language: settings.whatsapp.templateLanguage,
        },
      );
      whatsapp.push({ to: phone, ...result });
    }

    const email: { to: string; sent: boolean }[] = [];
    for (const to of settings.email.recipients) {
      await this.emailService.send(
        to,
        '[Prueba] Notificaciones de MayaHelp',
        `<p>Esta es una notificación de prueba enviada desde la configuración de MayaHelp.</p>
         ${this.ticketSummaryHtml(ticket, { name: 'Cliente de prueba', email: 'cliente@ejemplo.com' })}`,
      );
      email.push({ to, sent: settings.email.enabled });
    }

    return { whatsapp, email };
  }

  private async dispatch(
    event: NotificationEvent,
    params: {
      recipient: NotifyRecipient;
      ticket: NotifyTicket;
      event: string;
      author?: string;
      message?: string;
      clientEmail: EmailBody;
      internalEmail: EmailBody;
    },
  ): Promise<void> {
    let settings: AppSettingsDocument;
    try {
      settings = await this.appSettingsService.get();
    } catch (error) {
      this.logger.warn(
        `No se pudieron leer los ajustes de notificaciones: ${(error as Error).message}`,
      );
      return;
    }

    if (!settings.events[event]) {
      return;
    }

    const context = this.buildContext({
      ticket: params.ticket,
      event: params.event,
      recipientName: params.recipient.name,
      clientName: params.recipient.name,
      clientEmail: params.recipient.email,
      author: params.author,
      message: params.message,
    });

    if (settings.email.enabled) {
      if (settings.email.notifyClient && params.recipient.email) {
        await this.emailService.send(
          params.recipient.email,
          params.clientEmail.subject,
          params.clientEmail.html,
        );
      }
      for (const to of settings.email.recipients) {
        if (to === params.recipient.email.toLowerCase()) continue;
        await this.emailService.send(
          to,
          params.internalEmail.subject,
          params.internalEmail.html,
        );
      }
    }

    if (settings.whatsapp.enabled) {
      const template = {
        name: settings.whatsapp.templateName,
        language: settings.whatsapp.templateLanguage,
      };
      const bodyParams = resolveVariables(settings.whatsapp.variables, context);
      const phones = [...settings.whatsapp.recipients];
      if (settings.whatsapp.notifyClient && params.recipient.phone) {
        phones.push(params.recipient.phone);
      }
      for (const phone of [...new Set(phones)]) {
        await this.whatsappService.sendTemplate(phone, bodyParams, template);
      }
    }
  }

  private buildContext(params: {
    ticket: NotifyTicket;
    event: string;
    recipientName?: string;
    clientName?: string;
    clientEmail?: string;
    author?: string;
    message?: string;
  }): NotificationContext {
    const { ticket } = params;
    return {
      code: ticket.code,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.categoryName,
      project: ticket.projectName,
      clientName: params.clientName,
      clientEmail: params.clientEmail,
      recipientName: params.recipientName,
      author: params.author,
      message: params.message,
      event: params.event,
      link: this.ticketLink(ticket),
    };
  }

  private ticketSummaryHtml(
    ticket: NotifyTicket,
    client: { name: string; email: string },
  ): string {
    const rows: string[] = [
      `<li><strong>Código:</strong> ${ticket.code}</li>`,
      `<li><strong>Asunto:</strong> ${ticket.subject}</li>`,
      `<li><strong>Cliente:</strong> ${client.name} (${client.email})</li>`,
    ];
    if (ticket.categoryName) {
      rows.push(`<li><strong>Categoría:</strong> ${ticket.categoryName}</li>`);
    }
    if (ticket.projectName) {
      rows.push(`<li><strong>Proyecto:</strong> ${ticket.projectName}</li>`);
    }
    if (ticket.priority) {
      rows.push(`<li><strong>Prioridad:</strong> ${ticket.priority}</li>`);
    }
    if (ticket.status) {
      rows.push(`<li><strong>Estado:</strong> ${ticket.status}</li>`);
    }
    if (ticket.description) {
      rows.push(
        `<li><strong>Descripción:</strong> ${ticket.description.slice(0, 500)}</li>`,
      );
    }
    return `<ul>${rows.join('')}</ul>`;
  }

  private ticketLink(ticket: NotifyTicket): string {
    return `${this.appUrl}/tickets/${ticket._id}`;
  }
}
