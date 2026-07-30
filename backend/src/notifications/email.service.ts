import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey: string | undefined;
  private readonly emailFrom: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('resend.apiKey');
    this.emailFrom = this.configService.get<string>('resend.emailFrom')!;
  }

  /**
   * Best-effort: logs and returns instead of throwing, so email issues never break the caller.
   * `text` is the plain-text alternative — it helps deliverability and text-only clients.
   */
  async send(
    to: string,
    subject: string,
    html: string,
    text?: string,
  ): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn(
        `RESEND_API_KEY no configurada; se omite el correo "${subject}" a ${to}.`,
      );
      return;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.emailFrom,
          to,
          subject,
          html,
          ...(text ? { text } : {}),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(
          `Resend respondió ${response.status} al enviar a ${to}: ${body}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Error enviando correo a ${to}: ${(error as Error).message}`,
      );
    }
  }
}
