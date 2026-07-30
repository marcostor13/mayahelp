import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  APP_SETTINGS_KEY,
  AppSettings,
  AppSettingsDocument,
} from './schemas/app-settings.schema';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import {
  buildTicketTemplatePreset,
  TICKET_TEMPLATE_PRESET_VARIABLES,
} from './ticket-template-preset';
import {
  WhatsAppTemplatesService,
  WhatsAppTemplateSummary,
} from '../whatsapp-templates/whatsapp-templates.service';

@Injectable()
export class AppSettingsService {
  constructor(
    @InjectModel(AppSettings.name)
    private readonly settingsModel: Model<AppSettingsDocument>,
    private readonly configService: ConfigService,
    private readonly whatsappTemplatesService: WhatsAppTemplatesService,
  ) {}

  /**
   * Reads the singleton settings document, creating it on first use. Template name and
   * language fall back to the env values so an install that only had `.env` keeps working.
   */
  async get(): Promise<AppSettingsDocument> {
    const existing = await this.settingsModel
      .findOne({ key: APP_SETTINGS_KEY })
      .exec();
    if (existing) {
      return this.withEnvFallbacks(existing);
    }
    const created = await this.settingsModel.create({
      key: APP_SETTINGS_KEY,
      whatsapp: {
        templateName: this.envTemplateName(),
        templateLanguage: this.envTemplateLanguage(),
      },
    });
    return created;
  }

  /**
   * Creates (in Meta) the multi-line ticket template and points the settings at it,
   * mapping every `{{n}}` of its body in one go.
   */
  async applyTicketTemplatePreset(): Promise<{
    settings: AppSettingsDocument;
    template: WhatsAppTemplateSummary;
  }> {
    const language = (await this.get()).whatsapp.templateLanguage || 'es';
    const preset = buildTicketTemplatePreset(language);
    const template = await this.whatsappTemplatesService.create(preset);

    const settings = await this.updateNotifications({
      whatsapp: {
        templateName: template.name,
        templateLanguage: template.language,
        variables: [...TICKET_TEMPLATE_PRESET_VARIABLES],
      },
    });
    return { settings, template };
  }

  async updateNotifications(
    dto: UpdateNotificationSettingsDto,
  ): Promise<AppSettingsDocument> {
    const settings = await this.get();

    if (dto.whatsapp) {
      Object.assign(settings.whatsapp, dto.whatsapp);
      if (dto.whatsapp.recipients) {
        settings.whatsapp.recipients = normalizePhones(dto.whatsapp.recipients);
      }
    }
    if (dto.email) {
      Object.assign(settings.email, dto.email);
      if (dto.email.recipients) {
        settings.email.recipients = dedupe(
          dto.email.recipients.map((email) => email.trim().toLowerCase()),
        );
      }
    }
    if (dto.events) {
      Object.assign(settings.events, dto.events);
    }

    settings.markModified('whatsapp');
    settings.markModified('email');
    settings.markModified('events');
    return settings.save();
  }

  private withEnvFallbacks(settings: AppSettingsDocument): AppSettingsDocument {
    if (!settings.whatsapp.templateName) {
      settings.whatsapp.templateName = this.envTemplateName();
    }
    if (!settings.whatsapp.templateLanguage) {
      settings.whatsapp.templateLanguage = this.envTemplateLanguage();
    }
    return settings;
  }

  private envTemplateName(): string {
    return this.configService.get<string>('whatsapp.templateName') ?? '';
  }

  private envTemplateLanguage(): string {
    return this.configService.get<string>('whatsapp.templateLanguage') ?? 'es';
  }
}

/** WhatsApp Cloud API wants digits only; we store them normalized to avoid silent failures. */
function normalizePhones(phones: string[]): string[] {
  return dedupe(
    phones
      .map((phone) => phone.replace(/[^\d+]/g, '').replace(/^\+/, ''))
      .filter((phone) => phone.length >= 7),
  );
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
