/**
 * Tokens an admin can map onto the positional placeholders (`{{1}}`, `{{2}}`...) of the
 * approved WhatsApp template. The UI lists these; `resolveVariable` fills them at send time.
 */
export const NOTIFICATION_VARIABLES = [
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
  (typeof NOTIFICATION_VARIABLES)[number]['token'];

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

/**
 * Meta rejects template parameters that are empty or contain newlines/tabs, so every
 * value is collapsed to a single line and falls back to a dash when it resolves empty.
 */
function sanitize(value: string | undefined): string {
  const flat = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return '-';
  return flat.length > MAX_PARAM_LENGTH
    ? `${flat.slice(0, MAX_PARAM_LENGTH - 1)}…`
    : flat;
}

/** Unknown tokens are returned as-is, so an admin can also type a fixed value. */
export function resolveVariable(
  token: string,
  context: NotificationContext,
): string {
  switch (token.trim()) {
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
