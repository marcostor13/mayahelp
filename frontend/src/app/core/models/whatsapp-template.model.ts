export type WhatsAppTemplateCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';

export interface WhatsAppTemplate {
  id: string;
  name: string;
  status: string;
  category: WhatsAppTemplateCategory;
  language: string;
  headerText?: string;
  bodyText: string;
  footerText?: string;
}

export interface CreateWhatsAppTemplatePayload {
  name: string;
  language?: string;
  category: WhatsAppTemplateCategory;
  headerText?: string;
  bodyText: string;
  footerText?: string;
  bodyExamples?: string[];
}
