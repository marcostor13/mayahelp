import { Attachment } from '../attachments/schemas/attachment.schema';

interface PopulatedRef {
  name?: string;
  email?: string;
  company?: string;
  role?: string;
}

interface PopulatedComment {
  authorName: string;
  message: string;
  createdAt: Date;
  author?: PopulatedRef;
}

export interface MarkdownableTicket {
  code: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  client: PopulatedRef;
  category: PopulatedRef;
  project?: PopulatedRef | null;
  assignedAgent: PopulatedRef | null;
  comments: PopulatedComment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketWithAttachments {
  ticket: MarkdownableTicket;
  attachments: Attachment[];
}

const AI_INSTRUCTIONS = [
  '- Revisa la descripción y el hilo de conversación completo antes de proponer cambios.',
  '- Si hay adjuntos (capturas de pantalla, logs, documentos), revísalos: suelen contener el contexto clave.',
  '- Cita el código del ticket (ej. `TCK-8001`) en los commits o en el PR que resuelva cada caso.',
];

function formatDate(date: Date): string {
  return new Date(date).toISOString().slice(0, 16).replace('T', ' ');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** GitHub-flavoured heading slug, so the index of the combined export links to each ticket. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function metadataLines(ticket: MarkdownableTicket): string[] {
  const lines = [
    `- **Estado:** ${ticket.status}`,
    `- **Prioridad:** ${ticket.priority}`,
    `- **Categoría:** ${ticket.category?.name ?? 'Sin categoría'}`,
  ];
  if (ticket.project?.name) {
    lines.push(`- **Proyecto:** ${ticket.project.name}`);
  }
  lines.push(
    `- **Cliente:** ${ticket.client?.name ?? 'Desconocido'} (${ticket.client?.email ?? '—'})` +
      (ticket.client?.company ? ` — ${ticket.client.company}` : ''),
  );
  lines.push(
    `- **Agente asignado:** ${ticket.assignedAgent ? `${ticket.assignedAgent.name} (${ticket.assignedAgent.email})` : 'Sin asignar'}`,
  );
  lines.push(`- **Creado:** ${formatDate(ticket.createdAt)}`);
  lines.push(`- **Actualizado:** ${formatDate(ticket.updatedAt)}`);
  return lines;
}

/**
 * Body of one ticket. `level` is the depth of the ticket's own heading so the same
 * section works standalone (level 1) or nested inside the combined export (level 2).
 */
function ticketSection(entry: TicketWithAttachments, level: number): string[] {
  const { ticket, attachments } = entry;
  const h = '#'.repeat(level);
  const sub = '#'.repeat(level + 1);
  const lines: string[] = [];

  lines.push(`${h} [${ticket.code}] ${ticket.subject}`);
  lines.push('');
  lines.push(...metadataLines(ticket));
  lines.push('');
  lines.push(`${sub} Descripción`);
  lines.push('');
  lines.push(ticket.description);
  lines.push('');

  lines.push(`${sub} Conversación`);
  lines.push('');
  if (ticket.comments.length === 0) {
    lines.push('_Sin comentarios._');
    lines.push('');
  } else {
    for (const comment of ticket.comments) {
      const author = comment.author?.name ?? comment.authorName;
      const role = comment.author?.role ? ` (${comment.author.role})` : '';
      lines.push(
        `${'#'.repeat(level + 2)} ${author}${role} — ${formatDate(comment.createdAt)}`,
      );
      lines.push('');
      lines.push(comment.message);
      lines.push('');
    }
  }

  lines.push(`${sub} Adjuntos`);
  lines.push('');
  if (attachments.length === 0) {
    lines.push('_Sin adjuntos._');
  } else {
    for (const attachment of attachments) {
      // Images use image syntax so previews render inline in Markdown viewers.
      const prefix = attachment.kind === 'image' ? '!' : '';
      lines.push(
        `- ${prefix}[${attachment.filename}](${attachment.url}) (${attachment.kind}, ${formatBytes(attachment.size)})`,
      );
    }
  }
  lines.push('');

  return lines;
}

export function buildTicketMarkdown(
  ticket: MarkdownableTicket,
  attachments: Attachment[],
): string {
  const lines = ticketSection({ ticket, attachments }, 1);

  lines.push('## Contexto para implementación');
  lines.push('');
  lines.push(
    'Este archivo fue generado automáticamente desde MayaHelp para que una IA de desarrollo ' +
      '(Claude Code, Codex u otra) pueda analizar el problema reportado y proponer o implementar una solución.',
  );
  lines.push('');
  lines.push(...AI_INSTRUCTIONS);

  return lines.join('\n');
}

/**
 * Single Markdown document with every selected ticket: an index plus one section per
 * ticket. Meant to be pasted or handed whole to a coding agent.
 */
export function buildCombinedMarkdown(
  entries: TicketWithAttachments[],
  meta: { generatedAt: Date; filterSummary?: string },
): string {
  const lines: string[] = [];

  lines.push('# Tickets de MayaHelp');
  lines.push('');
  lines.push(
    `${entries.length} ticket(s) exportados el ${formatDate(meta.generatedAt)}` +
      (meta.filterSummary ? ` — filtro: ${meta.filterSummary}` : '') +
      '.',
  );
  lines.push('');
  lines.push('## Contexto para implementación');
  lines.push('');
  lines.push(
    'Este documento fue generado automáticamente desde MayaHelp para que una IA de desarrollo ' +
      '(Claude Code, Codex u otra) pueda analizar los casos reportados e implementar las soluciones.',
  );
  lines.push('');
  lines.push(...AI_INSTRUCTIONS);
  lines.push(
    '- Cada ticket es independiente: puedes resolverlos de a uno, en el orden de prioridad que veas.',
  );
  lines.push('');

  if (entries.length === 0) {
    lines.push('## Índice');
    lines.push('');
    lines.push('_No hay tickets que coincidan con el filtro seleccionado._');
    return lines.join('\n');
  }

  lines.push('## Índice');
  lines.push('');
  for (const { ticket } of entries) {
    const anchor = slugify(`${ticket.code} ${ticket.subject}`);
    lines.push(
      `- [${ticket.code} — ${ticket.subject}](#${anchor}) · ${ticket.status} · prioridad ${ticket.priority}` +
        (ticket.project?.name ? ` · ${ticket.project.name}` : ''),
    );
  }
  lines.push('');

  for (const entry of entries) {
    lines.push('---');
    lines.push('');
    lines.push(...ticketSection(entry, 2));
  }

  return lines.join('\n');
}
