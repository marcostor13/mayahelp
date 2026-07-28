import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateWhatsAppTemplateDto } from './dto/create-whatsapp-template.dto';

const GRAPH_API_VERSION = 'v21.0';

export interface WhatsAppTemplateSummary {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  headerText?: string;
  bodyText: string;
  footerText?: string;
}

interface GraphComponent {
  type: string;
  format?: string;
  text?: string;
}

interface GraphTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components?: GraphComponent[];
}

interface GraphErrorResponse {
  error?: { message?: string; error_user_msg?: string };
}

interface GraphListResponse extends GraphErrorResponse {
  data?: GraphTemplate[];
}

interface GraphCreateResponse extends GraphErrorResponse {
  id: string;
  status?: string;
  category?: string;
}

@Injectable()
export class WhatsAppTemplatesService {
  private readonly logger = new Logger(WhatsAppTemplatesService.name);
  private readonly accessToken?: string;
  private readonly businessAccountId?: string;

  constructor(private readonly configService: ConfigService) {
    this.accessToken = this.configService.get<string>('whatsapp.accessToken');
    this.businessAccountId = this.configService.get<string>(
      'whatsapp.businessAccountId',
    );
  }

  async list(): Promise<WhatsAppTemplateSummary[]> {
    const { accessToken, businessAccountId } = this.ensureConfigured();
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${businessAccountId}/message_templates?fields=name,status,category,language,components&limit=100`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = (await response.json()) as GraphListResponse;

    if (!response.ok) {
      this.logger.warn(
        `Error listando templates de WhatsApp: ${JSON.stringify(payload)}`,
      );
      throw new BadRequestException(
        payload.error?.message ??
          'No se pudieron obtener los templates de WhatsApp.',
      );
    }

    return (payload.data ?? []).map((template) => this.toSummary(template));
  }

  async create(
    dto: CreateWhatsAppTemplateDto,
  ): Promise<WhatsAppTemplateSummary> {
    const { accessToken, businessAccountId } = this.ensureConfigured();
    const language = dto.language ?? 'es';
    const components = this.buildComponents(dto);

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${businessAccountId}/message_templates`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: dto.name,
        language,
        category: dto.category,
        components,
      }),
    });
    const payload = (await response.json()) as GraphCreateResponse;

    if (!response.ok) {
      this.logger.warn(
        `Error creando template de WhatsApp: ${JSON.stringify(payload)}`,
      );
      throw new BadRequestException(
        payload.error?.error_user_msg ??
          payload.error?.message ??
          'No se pudo crear el template.',
      );
    }

    return {
      id: payload.id,
      name: dto.name,
      status: payload.status ?? 'PENDING',
      category: payload.category ?? dto.category,
      language,
      headerText: dto.headerText,
      bodyText: dto.bodyText,
      footerText: dto.footerText,
    };
  }

  private ensureConfigured(): {
    accessToken: string;
    businessAccountId: string;
  } {
    if (!this.accessToken || !this.businessAccountId) {
      throw new ServiceUnavailableException(
        'WhatsApp Cloud API no está configurada (falta WHATSAPP_ACCESS_TOKEN o WHATSAPP_BUSINESS_ACCOUNT_ID).',
      );
    }
    return {
      accessToken: this.accessToken,
      businessAccountId: this.businessAccountId,
    };
  }

  private buildComponents(dto: CreateWhatsAppTemplateDto): GraphComponent[] {
    const variableCount = new Set(
      [...dto.bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(
        (match) => match[1],
      ),
    ).size;
    if (variableCount > 0 && dto.bodyExamples?.length !== variableCount) {
      throw new BadRequestException(
        `El cuerpo usa ${variableCount} variable(s) ({{1}}, {{2}}...). Debes indicar ${variableCount} valor(es) de ejemplo para que Meta apruebe el template.`,
      );
    }

    const components: (GraphComponent & {
      example?: { body_text: string[][] };
    })[] = [];
    if (dto.headerText) {
      components.push({ type: 'HEADER', format: 'TEXT', text: dto.headerText });
    }
    const bodyComponent: GraphComponent & {
      example?: { body_text: string[][] };
    } = { type: 'BODY', text: dto.bodyText };
    if (dto.bodyExamples?.length) {
      bodyComponent.example = { body_text: [dto.bodyExamples] };
    }
    components.push(bodyComponent);
    if (dto.footerText) {
      components.push({ type: 'FOOTER', text: dto.footerText });
    }
    return components;
  }

  private toSummary(template: GraphTemplate): WhatsAppTemplateSummary {
    const header = template.components?.find((c) => c.type === 'HEADER');
    const body = template.components?.find((c) => c.type === 'BODY');
    const footer = template.components?.find((c) => c.type === 'FOOTER');
    return {
      id: template.id,
      name: template.name,
      status: template.status,
      category: template.category,
      language: template.language,
      headerText: header?.text,
      bodyText: body?.text ?? '',
      footerText: footer?.text,
    };
  }
}
