import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WhatsAppTemplateRef {
  name: string;
  language: string;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly phoneNumberId: string | undefined;
  private readonly accessToken: string | undefined;
  private readonly fallbackTemplateName: string;
  private readonly fallbackTemplateLanguage: string;

  constructor(private readonly configService: ConfigService) {
    this.phoneNumberId = this.configService.get<string>(
      'whatsapp.phoneNumberId',
    );
    this.accessToken = this.configService.get<string>('whatsapp.accessToken');
    this.fallbackTemplateName = this.configService.get<string>(
      'whatsapp.templateName',
    )!;
    this.fallbackTemplateLanguage = this.configService.get<string>(
      'whatsapp.templateLanguage',
    )!;
  }

  get isConfigured(): boolean {
    return Boolean(this.phoneNumberId && this.accessToken);
  }

  /**
   * Sends a pre-approved WhatsApp template message (required for business-initiated
   * messages outside the 24h customer-service window per Meta's Cloud API policy).
   * Best-effort: logs and returns instead of throwing.
   *
   * Returns whether Meta accepted the message, so callers that want to surface the
   * outcome (e.g. the "send test" button in settings) can do so.
   */
  async sendTemplate(
    toPhone: string,
    bodyParams: string[],
    template?: Partial<WhatsAppTemplateRef>,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.phoneNumberId || !this.accessToken) {
      const error =
        'WhatsApp Cloud API no está configurada (falta WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_ACCESS_TOKEN).';
      this.logger.warn(`${error} Se omite la notificación a ${toPhone}.`);
      return { ok: false, error };
    }

    const name = template?.name || this.fallbackTemplateName;
    const language = template?.language || this.fallbackTemplateLanguage;
    if (!name) {
      const error =
        'No hay un template de WhatsApp seleccionado en la configuración.';
      this.logger.warn(error);
      return { ok: false, error };
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
              name,
              language: { code: language },
              components: bodyParams.length
                ? [
                    {
                      type: 'body',
                      parameters: bodyParams.map((text) => ({
                        type: 'text',
                        text,
                      })),
                    },
                  ]
                : [],
            },
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(
          `WhatsApp Cloud API respondió ${response.status} para ${toPhone}: ${body}`,
        );
        return {
          ok: false,
          error: `Meta respondió ${response.status}: ${body}`,
        };
      }
      return { ok: true };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`Error enviando WhatsApp a ${toPhone}: ${message}`);
      return { ok: false, error: message };
    }
  }
}
