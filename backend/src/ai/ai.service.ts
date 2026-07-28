import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface CategoryOption {
  id: string;
  name: string;
}

export interface AiTicketDraft {
  subject: string;
  description: string;
  categoryId: string | null;
  priority: 'baja' | 'media' | 'alta';
}

export interface ReplyContext {
  subject: string;
  description: string;
  comments: { authorName: string; message: string }[];
}

export interface ReferenceArticle {
  title: string;
  content: string;
}

const REPLY_SYSTEM_PROMPT = `Eres un agente de soporte técnico de MayaHelp respondiendo a un cliente.
Escribe en español, con tono cordial y profesional, una respuesta clara y concreta al problema del
ticket. Si alguno de los artículos de ayuda que se te dan resuelve el problema, básate en ellos y
puedes mencionarlos. Si no tienes información suficiente para resolverlo con certeza, dilo con
honestidad y pide los datos que faltan en vez de inventar una solución. Responde solo con el texto
del mensaje para el cliente, sin encabezados ni JSON.`;

const SYSTEM_PROMPT = `Eres un asistente que ayuda a redactar tickets de soporte técnico claros y accionables
a partir de la descripción informal de un usuario. Respondes ÚNICAMENTE con un objeto JSON válido,
sin texto adicional, con esta forma exacta:
{"subject": string, "description": string, "category": string, "priority": "baja"|"media"|"alta"}

- "subject": un título corto y específico (máx. 80 caracteres).
- "description": una descripción clara y estructurada del problema, en español, ampliando lo que
  el usuario escribió (corrige redacción, agrega contexto razonable, pero no inventes hechos).
- "category": el nombre EXACTO de una de las categorías disponibles que se te dan, la que mejor calce.
- "priority": "alta" solo si el problema bloquea una operación crítica; "baja" si es una duda o algo menor.`;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiKey: string | undefined;
  private readonly textModel: string;
  private readonly visionModel: string;
  private client: OpenAI | null = null;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('nvidia.apiKey');
    this.textModel = this.configService.get<string>('nvidia.model')!;
    this.visionModel = this.configService.get<string>('nvidia.visionModel')!;
  }

  /** Lazy so a missing NVIDIA_API_KEY never crashes app bootstrap — only AI-dependent calls fail. */
  private getClient(): OpenAI {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'La creación de tickets con IA no está configurada (falta NVIDIA_API_KEY).',
      );
    }
    this.client ??= new OpenAI({
      apiKey: this.apiKey,
      baseURL: 'https://integrate.api.nvidia.com/v1',
    });
    return this.client;
  }

  async draftTicket(
    freeText: string,
    categories: CategoryOption[],
    imageBase64?: string,
  ): Promise<AiTicketDraft> {
    const categoryList = categories.map((c) => c.name).join(', ');
    const userPrompt = `Categorías disponibles: ${categoryList}\n\nDescripción del usuario:\n${freeText}`;

    const content: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: 'text', text: userPrompt },
    ];
    if (imageBase64) {
      content.push({ type: 'image_url', image_url: { url: imageBase64 } });
    }

    const completion = await this.getClient().chat.completions.create({
      model: imageBase64 ? this.visionModel : this.textModel,
      temperature: 0.3,
      max_tokens: 800,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    return this.parseDraft(raw, freeText, categories);
  }

  async suggestReply(
    context: ReplyContext,
    articles: ReferenceArticle[],
  ): Promise<string> {
    const articlesBlock =
      articles.length > 0
        ? articles
            .map((a, i) => `[Artículo ${i + 1}] ${a.title}\n${a.content}`)
            .join('\n\n')
        : 'No hay artículos del Centro de Ayuda relacionados.';

    const conversation =
      context.comments.length > 0
        ? context.comments
            .map((c) => `${c.authorName}: ${c.message}`)
            .join('\n')
        : '(sin comentarios previos)';

    const userPrompt = `Asunto: ${context.subject}\n\nDescripción del problema:\n${context.description}\n\nConversación hasta ahora:\n${conversation}\n\nArtículos de ayuda relevantes:\n${articlesBlock}`;

    const completion = await this.getClient().chat.completions.create({
      model: this.textModel,
      temperature: 0.4,
      max_tokens: 500,
      messages: [
        { role: 'system', content: REPLY_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });

    return completion.choices[0]?.message?.content?.trim() ?? '';
  }

  private parseDraft(
    raw: string,
    fallbackText: string,
    categories: CategoryOption[],
  ): AiTicketDraft {
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as {
        subject?: string;
        description?: string;
        category?: string;
        priority?: string;
      };

      const matchedCategory = categories.find(
        (c) => c.name.toLowerCase() === (parsed.category ?? '').toLowerCase(),
      );
      const priority = ['baja', 'media', 'alta'].includes(parsed.priority ?? '')
        ? (parsed.priority as AiTicketDraft['priority'])
        : 'media';

      return {
        subject: parsed.subject?.slice(0, 120) ?? fallbackText.slice(0, 80),
        description: parsed.description ?? fallbackText,
        categoryId: matchedCategory?.id ?? null,
        priority,
      };
    } catch (error) {
      this.logger.warn(
        `No se pudo interpretar la respuesta de IA: ${(error as Error).message}`,
      );
      return {
        subject: fallbackText.slice(0, 80),
        description: fallbackText,
        categoryId: null,
        priority: 'media',
      };
    }
  }
}
