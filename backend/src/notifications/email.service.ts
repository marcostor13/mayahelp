import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EmailResult {
  ok: boolean;
  error?: string;
}

const RESEND_API = 'https://api.resend.com';

/** `MayaHelp <avisos@dominio.com>` o `avisos@dominio.com` → `dominio.com`. */
export function senderDomain(emailFrom: string): string | undefined {
  const address = /<([^>]+)>/.exec(emailFrom)?.[1] ?? emailFrom;
  const domain = address.trim().split('@')[1];
  return domain ? domain.toLowerCase() : undefined;
}

/** Resend contesta `{ statusCode, name, message }`; lo que le sirve a una persona es `message`. */
function resendError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed.message) return `Resend (${status}): ${parsed.message}`;
  } catch {
    // No era JSON: se muestra tal cual.
  }
  return `Resend (${status}): ${body}`;
}

@Injectable()
export class EmailService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey: string | undefined;
  private readonly emailFrom: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('resend.apiKey');
    this.emailFrom = this.configService.get<string>('resend.emailFrom')!;
  }

  /** Sin esperar: un Resend lento o caído no puede demorar el arranque. */
  onApplicationBootstrap(): void {
    if (!this.apiKey) {
      this.logger.warn(
        'RESEND_API_KEY no configurada: no va a salir ningún correo.',
      );
      return;
    }
    void this.checkSender().then((result) => {
      if (result.ok) {
        this.logger.log(`Correo listo: se envía desde ${this.emailFrom}.`);
      } else {
        this.logger.warn(`Los correos no van a salir. ${result.error}`);
      }
    });
  }

  /**
   * Comprueba que el dominio de EMAIL_FROM esté verificado en la cuenta de Resend de
   * la clave: si no lo está, Resend rechaza todos los envíos. Una clave de solo envío
   * no puede listar dominios, así que ahí no hay nada que comprobar y se da por buena.
   */
  async checkSender(): Promise<EmailResult> {
    if (!this.apiKey) {
      return { ok: false, error: 'RESEND_API_KEY no configurada.' };
    }
    const domain = senderDomain(this.emailFrom);
    if (!domain) {
      return {
        ok: false,
        error: `EMAIL_FROM ("${this.emailFrom}") no tiene una dirección válida.`,
      };
    }

    try {
      const response = await fetch(`${RESEND_API}/domains`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      const body = await response.text();
      if (!response.ok) {
        if (body.includes('restricted_api_key')) return { ok: true };
        return { ok: false, error: resendError(response.status, body) };
      }

      const domains =
        (JSON.parse(body) as { data?: { name: string; status: string }[] })
          .data ?? [];
      // Verificar `ejemplo.com` habilita también enviar desde sus subdominios.
      const match = domains.find(
        (item) => domain === item.name || domain.endsWith(`.${item.name}`),
      );
      if (!match) {
        const available = domains.map((item) => item.name).join(', ');
        return {
          ok: false,
          error: `El dominio de EMAIL_FROM (${domain}) no está en la cuenta de Resend de esta clave. Dominios disponibles: ${available || 'ninguno'}.`,
        };
      }
      if (match.status !== 'verified') {
        return {
          ok: false,
          error: `El dominio ${match.name} está en Resend pero sin verificar (estado: ${match.status}).`,
        };
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: `No se pudo consultar a Resend: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Best-effort: logs and returns `false` instead of throwing, so email issues never
   * break the caller. `text` is the plain-text alternative — it helps deliverability
   * and text-only clients.
   */
  async send(
    to: string,
    subject: string,
    html: string,
    text?: string,
  ): Promise<boolean> {
    return (await this.deliver(to, subject, html, text)).ok;
  }

  /** Igual que `send`, pero devuelve el motivo cuando el correo no sale. */
  async deliver(
    to: string,
    subject: string,
    html: string,
    text?: string,
  ): Promise<EmailResult> {
    if (!this.apiKey) {
      const error = 'RESEND_API_KEY no configurada.';
      this.logger.warn(`${error} Se omite el correo "${subject}" a ${to}.`);
      return { ok: false, error };
    }

    try {
      const response = await fetch(`${RESEND_API}/emails`, {
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
        const error = resendError(response.status, await response.text());
        this.logger.warn(`${error} — al enviar a ${to}.`);
        return { ok: false, error };
      }
      return { ok: true };
    } catch (error) {
      const message = `Error enviando correo: ${(error as Error).message}`;
      this.logger.warn(`${message} — a ${to}.`);
      return { ok: false, error: message };
    }
  }
}
