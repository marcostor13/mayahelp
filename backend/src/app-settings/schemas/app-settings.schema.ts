import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AppSettingsDocument = HydratedDocument<AppSettings>;

/** Only one settings document ever exists; this is its fixed key. */
export const APP_SETTINGS_KEY = 'default';

@Schema({ _id: false })
export class WhatsAppNotificationSettings {
  @Prop({ default: false })
  enabled: boolean;

  /** E.164 numbers that get notified when tickets come in (the "configured numbers"). */
  @Prop({ type: [String], default: [] })
  recipients: string[];

  /** Also message the ticket's client, when they have a phone on their profile. */
  @Prop({ default: true })
  notifyClient: boolean;

  @Prop({ default: '' })
  templateName: string;

  @Prop({ default: 'es' })
  templateLanguage: string;

  /**
   * Ordered tokens for the template body placeholders: `variables[0]` fills `{{1}}`,
   * `variables[1]` fills `{{2}}`, and so on. See `notification-variables.ts`.
   */
  @Prop({ type: [String], default: [] })
  variables: string[];
}

export const WhatsAppNotificationSettingsSchema = SchemaFactory.createForClass(
  WhatsAppNotificationSettings,
);

@Schema({ _id: false })
export class EmailNotificationSettings {
  @Prop({ default: true })
  enabled: boolean;

  /** Send the notification to the client that owns the ticket. */
  @Prop({ default: true })
  notifyClient: boolean;

  /** Internal copies (support inbox, admins...). */
  @Prop({ type: [String], default: [] })
  recipients: string[];
}

export const EmailNotificationSettingsSchema = SchemaFactory.createForClass(
  EmailNotificationSettings,
);

@Schema({ _id: false })
export class NotificationEventSettings {
  @Prop({ default: true })
  ticketCreated: boolean;

  @Prop({ default: true })
  ticketUpdated: boolean;

  @Prop({ default: true })
  newComment: boolean;
}

export const NotificationEventSettingsSchema = SchemaFactory.createForClass(
  NotificationEventSettings,
);

@Schema({ timestamps: true })
export class AppSettings {
  @Prop({ required: true, unique: true, default: APP_SETTINGS_KEY })
  key: string;

  @Prop({ type: WhatsAppNotificationSettingsSchema, default: () => ({}) })
  whatsapp: WhatsAppNotificationSettings;

  @Prop({ type: EmailNotificationSettingsSchema, default: () => ({}) })
  email: EmailNotificationSettings;

  @Prop({ type: NotificationEventSettingsSchema, default: () => ({}) })
  events: NotificationEventSettings;
}

export const AppSettingsSchema = SchemaFactory.createForClass(AppSettings);
