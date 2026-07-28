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
  assignedAgent: PopulatedRef | null;
  comments: PopulatedComment[];
  createdAt: Date;
  updatedAt: Date;
}

function formatDate(date: Date): string {
  return new Date(date).toISOString().slice(0, 16).replace('T', ' ');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function buildTicketMarkdown(
  ticket: MarkdownableTicket,
  attachments: Attachment[],
): string {
  const lines: string[] = [];

  lines.push(`# [${ticket.code}] ${ticket.subject}`);
  lines.push('');
  lines.push(`- **Estado:** ${ticket.status}`);
  lines.push(`- **Prioridad:** ${ticket.priority}`);
  lines.push(`- **Categoría:** ${ticket.category?.name ?? 'Sin categoría'}`);
  lines.push(
    `- **Cliente:** ${ticket.client?.name ?? 'Desconocido'} (${ticket.client?.email ?? '—'})` +
      (ticket.client?.company ? ` — ${ticket.client.company}` : ''),
  );
  lines.push(
    `- **Agente asignado:** ${ticket.assignedAgent ? `${ticket.assignedAgent.name} (${ticket.assignedAgent.email})` : 'Sin asignar'}`,
  );
  lines.push(`- **Creado:** ${formatDate(ticket.createdAt)}`);
  lines.push(`- **Actualizado:** ${formatDate(ticket.updatedAt)}`);
  lines.push('');
  lines.push('## Descripción');
  lines.push('');
  lines.push(ticket.description);
  lines.push('');

  lines.push('## Conversación');
  lines.push('');
  if (ticket.comments.length === 0) {
    lines.push('_Sin comentarios._');
  } else {
    for (const comment of ticket.comments) {
      const author = comment.author?.name ?? comment.authorName;
      const role = comment.author?.role ? ` (${comment.author.role})` : '';
      lines.push(`### ${author}${role} — ${formatDate(comment.createdAt)}`);
      lines.push('');
      lines.push(comment.message);
      lines.push('');
    }
  }

  lines.push('## Adjuntos');
  lines.push('');
  if (attachments.length === 0) {
    lines.push('_Sin adjuntos._');
  } else {
    for (const attachment of attachments) {
      lines.push(
        `- [${attachment.filename}](${attachment.url}) (${attachment.kind}, ${formatBytes(attachment.size)})`,
      );
    }
  }
  lines.push('');

  lines.push('## Contexto para implementación');
  lines.push('');
  lines.push(
    'Este archivo fue generado automáticamente desde MayaHelp para que una IA de desarrollo ' +
      '(Claude Code u otra) pueda analizar el problema reportado y proponer o implementar una solución.',
  );
  lines.push('');
  lines.push(
    '- Revisa la descripción y el hilo de conversación completo antes de proponer cambios.',
  );
  lines.push(
    '- Si hay adjuntos (capturas de pantalla, logs, documentos), revísalos: suelen contener el contexto clave.',
  );
  lines.push(
    `- Ticket original: \`${ticket.code}\` (referencia interna de MayaHelp).`,
  );

  return lines.join('\n');
}
