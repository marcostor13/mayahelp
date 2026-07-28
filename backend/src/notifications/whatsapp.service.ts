import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly phoneNumberId: string | undefined;
  private readonly accessToken: string | undefined;
  private readonly templateName: string;
  private readonly templateLanguage: string;

  constructor(private readonly configService: ConfigService) {
    this.phoneNumberId = this.configService.get<string>(
      'whatsapp.phoneNumberId',
    );
    this.accessToken = this.configService.get<string>('whatsapp.accessToken');
    this.templateName = this.configService.get<string>(
      'whatsapp.templateName',
    )!;
    this.templateLanguage = this.configService.get<string>(
      'whatsapp.templateLanguage',
    )!;
  }

  /**
   * Sends a pre-approved WhatsApp template message (required for business-initiated
   * messages outside the 24h customer-service window per Meta's Cloud API policy).
   * Best-effort: logs and returns instead of throwing.
   */
  async sendTemplate(toPhone: string, bodyParams: string[]): Promise<void> {
    if (!this.phoneNumberId || !this.accessToken) {
      this.logger.warn(
        `WhatsApp Cloud API no configurada; se omite la notificación a ${toPhone}.`,
      );
      return;
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: toPhone,
            type: 'template',
            template: {
              name: this.templateName,
              language: { code: this.templateLanguage },
              components: [
                {
                  type: 'body',
                  parameters: bodyParams.map((text) => ({
                    type: 'text',
                    text,
                  })),
                },
              ],
            },
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(
          `WhatsApp Cloud API respondió ${response.status} para ${toPhone}: ${body}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Error enviando WhatsApp a ${toPhone}: ${(error as Error).message}`,
      );
    }
  }
}
