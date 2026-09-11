// `import type`: el tipo vive en notifications y notifications importa TicketEdit de acá.
// Sin la palabra `type` el compilador podría emitir el require y cerrar el ciclo en runtime.
import type { NotifyTicket } from '../notifications/notifications.service';

/** Un campo que cambió, ya listo para mostrar: sin ids ni claves internas. */
export interface TicketEdit {
  field: 'subject' | 'description' | 'category' | 'priority';
  label: string;
  from: string;
  to: string;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Compara dos fotos del mismo ticket y devuelve lo que cambió.
 *
 * Trabaja sobre `NotifyTicket` en vez de sobre el documento porque ahí la categoría ya
 * viene con nombre: un aviso que dijera "categoría: 6819... → 681a..." no le sirve a nadie.
 * Un campo que pasa a vacío o llega vacío se ignora — no es una edición, es un dato que falta.
 */
export function describeTicketChanges(
  before: NotifyTicket,
  after: NotifyTicket,
): TicketEdit[] {
  const candidates: Array<{
    field: TicketEdit['field'];
    label: string;
    from?: string;
    to?: string;
    format?: (value: string) => string;
  }> = [
    {
      field: 'subject',
      label: 'Asunto',
      from: before.subject,
      to: after.subject,
    },
    {
      field: 'description',
      label: 'Descripción',
      from: before.description,
      to: after.description,
    },
    {
      field: 'category',
      label: 'Categoría',
      from: before.categoryName,
      to: after.categoryName,
    },
    {
      field: 'priority',
      label: 'Prioridad',
      from: before.priority,
      to: after.priority,
      format: capitalize,
    },
  ];

  const changes: TicketEdit[] = [];
  for (const candidate of candidates) {
    const { from, to, format } = candidate;
    if (!from || !to || from === to) continue;
    changes.push({
      field: candidate.field,
      label: candidate.label,
      from: format ? format(from) : from,
      to: format ? format(to) : to,
    });
  }
  return changes;
}
