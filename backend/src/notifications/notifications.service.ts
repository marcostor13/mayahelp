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
import {
  EmailAccent,
  EmailContent,
  EmailRow,
  renderNotificationEmail,
  renderNotificationText,
} from './email-template';

export interface NotifyRecipient {
  name: string;
  email: string;
  phone?: string;
  /** Per-user opt-out set by an admin; absent means "both channels allowed". */
  notifications?: { email?: boolean; whatsapp?: boolean };
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
  content: EmailContent;
}

/** Status drives the accent colour of the email, so an update reads at a glance. */
const STATUS_ACCENT: Record<string, EmailAccent> = {
  abierto: 'primary',
  en_proceso: 'warning',
  resuelto: 'success',
  cerrado: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  abierto: 'Abierto',
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
        content: {
          preheader: `Registramos "${ticket.subject}" con el código ${ticket.code}.`,
          badge: 'Ticket recibido',
          title: `Hola ${recipient.name}, recibimos tu solicitud`,
          intro: `Registramos "${ticket.subject}" con el código ${ticket.code}. Un agente la va a revisar y te avisamos por acá en cuanto haya novedades.`,
          accent: 'primary',
          rows: this.ticketRows(ticket, recipient),
          action: { label: 'Ver el ticket', url: link },
          footerNote:
            'Podés responder a este correo si necesitás agregar información.',
        },
      },
      internalEmail: {
        subject: `Nuevo ticket ${ticket.code}: ${ticket.subject}`,
        content: {
          preheader: `${ticket.subject} — ${recipient.name}`,
          badge: 'Nuevo ticket',
          title: ticket.subject,
          intro: `Entró un ticket nuevo de ${recipient.name} (${recipient.email}).`,
          accent: 'primary',
          rows: this.ticketRows(ticket, recipient),
          quote: ticket.description
            ? { author: recipient.name, text: ticket.description }
            : undefined,
          action: { label: 'Abrir el ticket', url: link },
        },
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
        content: {
          preheader: `${authorName} respondió en ${ticket.code}.`,
          badge: 'Nueva respuesta',
          title: `${authorName} respondió tu ticket`,
          intro: `Hay una respuesta nueva en "${ticket.subject}" (${ticket.code}).`,
          accent: 'primary',
          rows: this.ticketRows(ticket, recipient),
          quote: { author: authorName, text: message },
          action: { label: 'Ver la conversación', url: link },
        },
      },
      internalEmail: {
        subject: `Comentario en ${ticket.code}: ${ticket.subject}`,
        content: {
          preheader: `${authorName}: ${message}`,
          badge: 'Nuevo comentario',
          title: ticket.subject,
          intro: `${authorName} comentó en ${ticket.code}.`,
          accent: 'primary',
          rows: this.ticketRows(ticket, recipient),
          quote: { author: authorName, text: message },
          action: { label: 'Abrir el ticket', url: link },
        },
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
        content: {
          preheader: `${ticket.code} pasó a ${this.statusLabel(status)}.`,
          badge: this.statusLabel(status),
          title: `Tu ticket pasó a "${this.statusLabel(status)}"`,
          intro: `Hola ${recipient.name}, actualizamos el estado de "${ticket.subject}" (${ticket.code}).`,
          accent: this.statusAccent(status),
          rows: this.ticketRows({ ...ticket, status }, recipient),
          action: { label: 'Ver el ticket', url: link },
        },
      },
      internalEmail: {
        subject: `${ticket.code} cambió a ${status}`,
        content: {
          preheader: `${ticket.subject} → ${this.statusLabel(status)}`,
          badge: this.statusLabel(status),
          title: ticket.subject,
          intro: `El ticket ${ticket.code} cambió de estado a ${this.statusLabel(status)}.`,
          accent: this.statusAccent(status),
          rows: this.ticketRows({ ...ticket, status }, recipient),
          action: { label: 'Abrir el ticket', url: link },
        },
      },
    });
  }

  /**
   * Infrastructure alert coming from the monitoring module (site down, disk full,
   * certificate expiring...). It reuses the same channels and the same email layout as
   * the ticket notifications, plus any extra recipients configured on that connection.
   */
  async notifyMonitoringAlert(params: {
    projectName: string;
    connectionName: string;
    connectionType: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    detail: string;
    target: string;
    channels: { email: boolean; whatsapp: boolean };
    extraEmails: string[];
    extraPhones: string[];
  }): Promise<void> {
    let settings: AppSettingsDocument | null = null;
    try {
      settings = await this.appSettingsService.get();
    } catch (error) {
      this.logger.warn(
        `No se pudieron leer los ajustes para la alerta de monitoreo: ${(error as Error).message}`,
      );
    }

    const accent: EmailAccent =
      params.severity === 'critical'
        ? 'warning'
        : params.severity === 'warning'
          ? 'warning'
          : 'success';
    const content: EmailContent = {
      preheader: `${params.projectName}: ${params.title}`,
      badge:
        params.severity === 'critical'
          ? 'Alerta crítica'
          : params.severity === 'warning'
            ? 'Advertencia'
            : 'Recuperado',
      title: params.title,
      intro: params.detail,
      accent: params.severity === 'info' ? 'success' : accent,
      rows: [
        { label: 'Proyecto', value: params.projectName },
        { label: 'Conexión', value: params.connectionName },
        { label: 'Tipo', value: params.connectionType },
        ...(params.target ? [{ label: 'Destino', value: params.target }] : []),
        { label: 'Detectado', value: new Date().toLocaleString('es-ES') },
      ],
      action: { label: 'Ver el monitoreo', url: `${this.appUrl}/monitoring` },
    };

    if (params.channels.email && settings?.email.enabled !== false) {
      const recipients = [
        ...(settings?.email.recipients ?? []),
        ...params.extraEmails,
      ];
      for (const to of [...new Set(recipients)]) {
        await this.sendEmail(to, {
          subject: `[${params.projectName}] ${params.title}`,
          content,
        });
      }
    }

    if (params.channels.whatsapp && settings?.whatsapp.enabled) {
      const context: NotificationContext = {
        code: params.connectionName,
        subject: params.title,
        description: params.detail,
        status: params.severity,
        priority: params.severity === 'critical' ? 'alta' : 'media',
        category: params.connectionType,
        project: params.projectName,
        event: params.title,
        link: `${this.appUrl}/monitoring`,
      };
      const phones = [...settings.whatsapp.recipients, ...params.extraPhones];
      for (const phone of [...new Set(phones)]) {
        await this.whatsappService.sendTemplate(
          phone,
          resolveVariables(settings.whatsapp.variables, context),
          {
            name: settings.whatsapp.templateName,
            language: settings.whatsapp.templateLanguage,
          },
        );
      }
    }
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
      await this.sendEmail(to, {
        subject: '[Prueba] Notificaciones de MayaHelp',
        content: {
          preheader: 'Así se van a ver los avisos de tickets.',
          badge: 'Prueba',
          title: 'Notificaciones configuradas',
          intro:
            'Esta es una notificación de prueba enviada desde Ajustes. Si la estás viendo, el correo de MayaHelp funciona.',
          accent: 'success',
          rows: this.ticketRows(ticket, {
            name: 'Cliente de prueba',
            email: 'cliente@ejemplo.com',
          }),
          quote: ticket.description
            ? { author: 'Cliente de prueba', text: ticket.description }
            : undefined,
          action: { label: 'Ir a MayaHelp', url: this.appUrl },
        },
      });
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

    const recipientWantsEmail = params.recipient.notifications?.email !== false;
    const recipientWantsWhatsApp =
      params.recipient.notifications?.whatsapp !== false;

    if (settings.email.enabled) {
      if (
        settings.email.notifyClient &&
        params.recipient.email &&
        recipientWantsEmail
      ) {
        await this.sendEmail(params.recipient.email, params.clientEmail);
      }
      for (const to of settings.email.recipients) {
        if (to === params.recipient.email.toLowerCase()) continue;
        await this.sendEmail(to, params.internalEmail);
      }
    }

    if (settings.whatsapp.enabled) {
      const template = {
        name: settings.whatsapp.templateName,
        language: settings.whatsapp.templateLanguage,
      };
      const bodyParams = resolveVariables(settings.whatsapp.variables, context);
      const phones = [...settings.whatsapp.recipients];
      if (
        settings.whatsapp.notifyClient &&
        params.recipient.phone &&
        recipientWantsWhatsApp
      ) {
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

  private async sendEmail(to: string, body: EmailBody): Promise<void> {
    await this.emailService.send(
      to,
      body.subject,
      renderNotificationEmail(body.content, { appUrl: this.appUrl }),
      renderNotificationText(body.content),
    );
  }

  /** Ticket facts shown as a labelled block in every email. */
  private ticketRows(
    ticket: NotifyTicket,
    client: { name: string; email: string },
  ): EmailRow[] {
    const rows: EmailRow[] = [{ label: 'Ticket', value: ticket.code }];
    rows.push({ label: 'Asunto', value: ticket.subject });
    if (ticket.status) {
      rows.push({ label: 'Estado', value: this.statusLabel(ticket.status) });
    }
    if (ticket.priority) {
      rows.push({ label: 'Prioridad', value: capitalize(ticket.priority) });
    }
    if (ticket.categoryName) {
      rows.push({ label: 'Categoría', value: ticket.categoryName });
    }
    if (ticket.projectName) {
      rows.push({ label: 'Proyecto', value: ticket.projectName });
    }
    rows.push({ label: 'Cliente', value: `${client.name} (${client.email})` });
    return rows;
  }

  private statusLabel(status: string): string {
    return STATUS_LABEL[status] ?? status;
  }

  private statusAccent(status: string): EmailAccent {
    return STATUS_ACCENT[status] ?? 'primary';
  }

  private ticketLink(ticket: NotifyTicket): string {
    return `${this.appUrl}/tickets/${ticket._id}`;
  }
}
