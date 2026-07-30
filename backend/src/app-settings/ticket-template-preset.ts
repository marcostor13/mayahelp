import { CreateWhatsAppTemplateDto } from '../whatsapp-templates/dto/create-whatsapp-template.dto';
import { NotificationContext, resolveVariable } from './notification-variables';

/**
 * Ready-made WhatsApp template that renders a ticket over several lines.
 *
 * Meta rejects a template *parameter* containing newlines, so a single "everything"
 * variable can only ever arrive as one line. The line breaks have to live in the
 * template body instead — one variable per line — which is exactly what this preset is.
 */
export const TICKET_TEMPLATE_PRESET_NAME = 'mayahelp_ticket_completo';

export const TICKET_TEMPLATE_PRESET_BODY = [
  '🎫 Ticket {{1}}',
  '',
  '📌 Asunto: {{2}}',
  '🔄 Estado: {{3}}',
  '⚡ Prioridad: {{4}}',
  '🏷️ Categoría: {{5}}',
  '📁 Proyecto: {{6}}',
  '👤 Cliente: {{7}}',
  '',
  '📝 {{8}}',
  '',
  '🔗 {{9}}',
].join('\n');

/** Token that fills each `{{n}}` of the preset body, in order. */
export const TICKET_TEMPLATE_PRESET_VARIABLES = [
  '{{code}}',
  '{{subject}}',
  '{{status}}',
  '{{priority}}',
  '{{category}}',
  '{{project}}',
  '{{client_name}}',
  '{{description}}',
  '{{link}}',
];

const PRESET_SAMPLE: NotificationContext = {
  code: 'TCK-8001',
  subject: 'No carga el dashboard',
  description: 'Al entrar al panel queda cargando indefinidamente.',
  status: 'abierto',
  priority: 'alta',
  category: 'Bug',
  project: 'Portal Acme',
  clientName: 'Ana Pérez',
  clientEmail: 'ana@acme.com',
  event: 'Nuevo ticket',
  link: 'https://mayahelp.app/tickets/653f1a2b',
};

/** Payload for `WhatsAppTemplatesService.create`, with the example Meta requires per variable. */
export function buildTicketTemplatePreset(
  language = 'es',
): CreateWhatsAppTemplateDto {
  return {
    name: TICKET_TEMPLATE_PRESET_NAME,
    language,
    category: 'UTILITY',
    bodyText: TICKET_TEMPLATE_PRESET_BODY,
    bodyExamples: TICKET_TEMPLATE_PRESET_VARIABLES.map((token) =>
      resolveVariable(token, PRESET_SAMPLE),
    ),
    footerText: 'MayaHelp · Soporte técnico',
  };
}
