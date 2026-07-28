import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { WhatsAppService } from './whatsapp.service';

export interface NotifyRecipient {
  name: string;
  email: string;
  phone?: string;
}

export interface NotifyTicket {
  _id: string;
  code: string;
  subject: string;
}

@Injectable()
export class NotificationsService {
  private readonly appUrl: string;

  constructor(
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsAppService,
    private readonly configService: ConfigService,
  ) {
    this.appUrl = this.configService.get<string>('corsOrigin')!;
  }

  async notifyTicketCreated(
    recipient: NotifyRecipient,
    ticket: NotifyTicket,
  ): Promise<void> {
    const link = this.ticketLink(ticket);
    await this.emailService.send(
      recipient.email,
      `Hemos recibido tu ticket ${ticket.code}`,
      `<p>Hola ${recipient.name},</p>
       <p>Recibimos tu solicitud "<strong>${ticket.subject}</strong>" (${ticket.code}). Un agente la revisará pronto.</p>
       <p><a href="${link}">Ver el ticket</a></p>`,
    );
    if (recipient.phone) {
      await this.whatsappService.sendTemplate(recipient.phone, [
        recipient.name,
        ticket.code,
        ticket.subject,
      ]);
    }
  }

  async notifyNewComment(
    recipient: NotifyRecipient,
    ticket: NotifyTicket,
    authorName: string,
    message: string,
  ): Promise<void> {
    const link = this.ticketLink(ticket);
    await this.emailService.send(
      recipient.email,
      `Nueva respuesta en tu ticket ${ticket.code}`,
      `<p>Hola ${recipient.name},</p>
       <p><strong>${authorName}</strong> respondió en "${ticket.subject}" (${ticket.code}):</p>
       <blockquote>${message}</blockquote>
       <p><a href="${link}">Ver la conversación</a></p>`,
    );
    if (recipient.phone) {
      await this.whatsappService.sendTemplate(recipient.phone, [
        recipient.name,
        ticket.code,
        message.slice(0, 100),
      ]);
    }
  }

  async notifyStatusChanged(
    recipient: NotifyRecipient,
    ticket: NotifyTicket,
    status: string,
  ): Promise<void> {
    const link = this.ticketLink(ticket);
    await this.emailService.send(
      recipient.email,
      `Actualización de tu ticket ${ticket.code}`,
      `<p>Hola ${recipient.name},</p>
       <p>Tu ticket "<strong>${ticket.subject}</strong>" (${ticket.code}) cambió de estado a: <strong>${status}</strong>.</p>
       <p><a href="${link}">Ver el ticket</a></p>`,
    );
    if (recipient.phone) {
      await this.whatsappService.sendTemplate(recipient.phone, [
        recipient.name,
        ticket.code,
        status,
      ]);
    }
  }

  private ticketLink(ticket: NotifyTicket): string {
    return `${this.appUrl}/tickets/${ticket._id}`;
  }
}
