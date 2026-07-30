export interface NotificationContext {
  code: string;
  subject: string;
  description?: string;
  status?: string;
  priority?: string;
  category?: string;
  project?: string;
  clientName?: string;
  clientEmail?: string;
  recipientName?: string;
  author?: string;
  message?: string;
  event: string;
  link: string;
}

const MAX_PARAM_LENGTH = 500;
/** Meta rejects tabs/newlines inside parameters, so fields are joined with a middot. */
const SUMMARY_SEPARATOR = ' · ';
/** Below this, a description stub adds noise instead of context, so it is dropped. */
const MIN_DESCRIPTION_CHARS = 24;

function flatten(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * Meta rejects template parameters that are empty or contain newlines/tabs, so every
 * value is collapsed to a single line and falls back to a dash when it resolves empty.
 */
function sanitize(value: string | undefined): string {
  const flat = flatten(value);
  if (!flat) return '-';
  return truncate(flat, MAX_PARAM_LENGTH);
}

/**
 * Every field of the ticket in one parameter, in a fixed reading order:
 * code, subject, status, priority, category, project, client, description, link.
 *
 * It is a single line on purpose — WhatsApp rejects a template parameter containing
 * newlines — so fields are separated by "·" and empty ones are skipped. The description
 * is the last field to be filled and only gets the space left by the others, so a long
 * description can never push the status or the link out of the message.
 */
export function buildTicketSummary(context: NotificationContext): string {
  const parts: string[] = [];
  const push = (label: string | null, value?: string) => {
    const text = flatten(value);
    if (!text) return;
    parts.push(label ? `${label}: ${text}` : text);
  };

  push(null, context.code);
  push('Asunto', context.subject);
  push('Estado', context.status);
  push('Prioridad', context.priority);
  push('Categoría', context.category);
  push('Proyecto', context.project);
  push('Cliente', buildClient(context));

  const link = flatten(context.link);
  const linkPart = link ? `Ver: ${link}` : '';

  const description = flatten(context.description);
  if (description) {
    const fixedLength = [...parts, linkPart]
      .filter(Boolean)
      .join(SUMMARY_SEPARATOR).length;
    const available =
      MAX_PARAM_LENGTH -
      fixedLength -
      SUMMARY_SEPARATOR.length -
      'Descripción: '.length;
    if (available >= MIN_DESCRIPTION_CHARS) {
      parts.push(`Descripción: ${truncate(description, available)}`);
    }
  }

  if (linkPart) parts.push(linkPart);

  return sanitize(parts.join(SUMMARY_SEPARATOR));
}

function buildClient(context: NotificationContext): string {
  const name = flatten(context.clientName);
  const email = flatten(context.clientEmail);
  if (name && email) return `${name} (${email})`;
  return name || email;
}

/** Unknown tokens are returned as-is, so an admin can also type a fixed value. */
export function resolveVariable(
  token: string,
  context: NotificationContext,
): string {
  switch (token.trim()) {
    case '{{ticket_completo}}':
      return buildTicketSummary(context);
    case '{{code}}':
      return sanitize(context.code);
    case '{{subject}}':
      return sanitize(context.subject);
    case '{{description}}':
      return sanitize(context.description);
    case '{{status}}':
      return sanitize(context.status);
    case '{{priority}}':
      return sanitize(context.priority);
    case '{{category}}':
      return sanitize(context.category);
    case '{{project}}':
      return sanitize(context.project);
    case '{{client_name}}':
      return sanitize(context.clientName);
    case '{{client_email}}':
      return sanitize(context.clientEmail);
    case '{{recipient_name}}':
      return sanitize(context.recipientName);
    case '{{author}}':
      return sanitize(context.author);
    case '{{message}}':
      return sanitize(context.message);
    case '{{event}}':
      return sanitize(context.event);
    case '{{link}}':
      return sanitize(context.link);
    case '{{date}}':
      return sanitize(new Date().toLocaleString('es-ES'));
    default:
      return sanitize(token);
  }
}

export function resolveVariables(
  tokens: string[],
  context: NotificationContext,
): string[] {
  return tokens.map((token) => resolveVariable(token, context));
}

/**
 * Tokens an admin can map onto the positional placeholders (`{{1}}`, `{{2}}`...) of the
 * approved WhatsApp template. The UI lists these; `resolveVariable` fills them at send time.
 */
const VARIABLE_DEFINITIONS = [
  {
    token: '{{ticket_completo}}',
    label: 'Ticket completo (todos los datos, incluido el estado)',
  },
  { token: '{{code}}', label: 'Código del ticket' },
  { token: '{{subject}}', label: 'Asunto' },
  { token: '{{description}}', label: 'Descripción (recortada)' },
  { token: '{{status}}', label: 'Estado' },
  { token: '{{priority}}', label: 'Prioridad' },
  { token: '{{category}}', label: 'Categoría' },
  { token: '{{project}}', label: 'Proyecto' },
  { token: '{{client_name}}', label: 'Nombre del cliente' },
  { token: '{{client_email}}', label: 'Correo del cliente' },
  { token: '{{recipient_name}}', label: 'Nombre del destinatario' },
  { token: '{{author}}', label: 'Autor del último comentario' },
  { token: '{{message}}', label: 'Último comentario (recortado)' },
  { token: '{{event}}', label: 'Evento (creado / actualizado / comentario)' },
  { token: '{{link}}', label: 'Enlace al ticket' },
  { token: '{{date}}', label: 'Fecha y hora' },
] as const;

export type NotificationVariableToken =
  (typeof VARIABLE_DEFINITIONS)[number]['token'];

/** Sample ticket used only to show the admin what each variable produces. */
const SAMPLE_CONTEXT: NotificationContext = {
  code: 'TCK-8001',
  subject: 'No carga el dashboard',
  description:
    'Al entrar al panel queda cargando indefinidamente en Chrome y en Safari.',
  status: 'abierto',
  priority: 'alta',
  category: 'Bug',
  project: 'Portal Acme',
  clientName: 'Ana Pérez',
  clientEmail: 'ana@acme.com',
  recipientName: 'Equipo de soporte',
  author: 'Ana Pérez',
  message: 'Sigue pasando después de limpiar la caché.',
  event: 'Nuevo ticket',
  link: 'https://mayahelp.app/tickets/653f1a2b',
};

/**
 * The examples are resolved with the real resolver, so what the settings screen shows
 * can never drift from what actually gets sent.
 */
export const NOTIFICATION_VARIABLES = VARIABLE_DEFINITIONS.map(
  (definition) => ({
    ...definition,
    example: resolveVariable(definition.token, SAMPLE_CONTEXT),
  }),
);
