export interface WhatsAppNotificationSettings {
  enabled: boolean;
  /** Numbers notified when tickets come in (E.164, without the leading +). */
  recipients: string[];
  notifyClient: boolean;
  templateName: string;
  templateLanguage: string;
  /** Token per positional placeholder of the template body: index 0 fills {{1}}. */
  variables: string[];
}

export interface EmailNotificationSettings {
  enabled: boolean;
  notifyClient: boolean;
  recipients: string[];
}

export interface NotificationEventSettings {
  ticketCreated: boolean;
  ticketUpdated: boolean;
  newComment: boolean;
}

export interface NotificationVariable {
  token: string;
  label: string;
  /** What this variable produces for a sample ticket, resolved by the backend itself. */
  example?: string;
}

export interface NotificationSettings {
  whatsapp: WhatsAppNotificationSettings;
  email: EmailNotificationSettings;
  events: NotificationEventSettings;
  availableVariables: NotificationVariable[];
}

export interface UpdateNotificationSettingsPayload {
  whatsapp?: Partial<WhatsAppNotificationSettings>;
  email?: Partial<EmailNotificationSettings>;
  events?: Partial<NotificationEventSettings>;
}

export interface NotificationTestResult {
  whatsapp: { to: string; ok: boolean; error?: string }[];
  email: { to: string; sent: boolean }[];
}
