import { buildTicketMarkdown, MarkdownableTicket } from './markdown-builder';
import { Attachment } from '../attachments/schemas/attachment.schema';

function ticket(
  overrides: Partial<MarkdownableTicket> = {},
): MarkdownableTicket {
  return {
    code: 'TCK-8042',
    subject: 'No puedo subir la factura',
    description: 'Al subir el PDF la pantalla queda en blanco.',
    status: 'abierto',
    priority: 'alta',
    client: {
      name: 'Ana Pérez',
      email: 'ana@example.com',
      company: 'Acme',
    },
    category: { name: 'Facturación' },
    assignedAgent: null,
    comments: [],
    createdAt: new Date('2026-03-01T10:30:00Z'),
    updatedAt: new Date('2026-03-02T09:00:00Z'),
    ...overrides,
  };
}

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    filename: 'captura.png',
    url: 'https://cdn.example.com/captura.png',
    kind: 'image',
    size: 2048,
    ...overrides,
  } as Attachment;
}

describe('buildTicketMarkdown', () => {
  it('opens with the ticket code and subject as the H1', () => {
    const output = buildTicketMarkdown(ticket(), []);
    expect(output.split('\n')[0]).toBe(
      '# [TCK-8042] No puedo subir la factura',
    );
  });

  it('includes the metadata block', () => {
    const output = buildTicketMarkdown(ticket(), []);
    expect(output).toContain('- **Estado:** abierto');
    expect(output).toContain('- **Prioridad:** alta');
    expect(output).toContain('- **Categoría:** Facturación');
    expect(output).toContain(
      '- **Cliente:** Ana Pérez (ana@example.com) — Acme',
    );
    expect(output).toContain('- **Agente asignado:** Sin asignar');
  });

  it('formats dates as YYYY-MM-DD HH:mm', () => {
    expect(buildTicketMarkdown(ticket(), [])).toContain(
      '- **Creado:** 2026-03-01 10:30',
    );
  });

  it('omits the company suffix when the client has none', () => {
    const output = buildTicketMarkdown(
      ticket({ client: { name: 'Ana', email: 'ana@example.com' } }),
      [],
    );
    expect(output).toContain('- **Cliente:** Ana (ana@example.com)');
    expect(output).not.toContain('— undefined');
  });

  it('renders the assigned agent when there is one', () => {
    const output = buildTicketMarkdown(
      ticket({ assignedAgent: { name: 'Luis', email: 'luis@example.com' } }),
      [],
    );
    expect(output).toContain('- **Agente asignado:** Luis (luis@example.com)');
  });

  it('marks empty sections explicitly instead of leaving them blank', () => {
    const output = buildTicketMarkdown(ticket(), []);
    expect(output).toContain('_Sin comentarios._');
    expect(output).toContain('_Sin adjuntos._');
  });

  it('renders each comment with its author, role and timestamp', () => {
    const output = buildTicketMarkdown(
      ticket({
        comments: [
          {
            authorName: 'Ana Pérez',
            message: 'Sigo sin poder subirlo.',
            createdAt: new Date('2026-03-01T11:00:00Z'),
            author: { name: 'Ana Pérez', role: 'client' },
          },
        ],
      }),
      [],
    );
    expect(output).toContain('### Ana Pérez (client) — 2026-03-01 11:00');
    expect(output).toContain('Sigo sin poder subirlo.');
  });

  it('falls back to the denormalised author name when the ref is not populated', () => {
    const output = buildTicketMarkdown(
      ticket({
        comments: [
          {
            authorName: 'Usuario eliminado',
            message: 'Hola',
            createdAt: new Date('2026-03-01T11:00:00Z'),
          },
        ],
      }),
      [],
    );
    expect(output).toContain('### Usuario eliminado — 2026-03-01 11:00');
  });

  it('lists attachments with a human-readable size', () => {
    const output = buildTicketMarkdown(ticket(), [
      attachment({ size: 512, filename: 'log.txt', kind: 'document' }),
      attachment({ size: 2048 }),
      attachment({
        size: 3 * 1024 * 1024,
        filename: 'demo.mp4',
        kind: 'video',
      }),
    ]);
    expect(output).toContain(
      '- [log.txt](https://cdn.example.com/captura.png) (document, 512B)',
    );
    expect(output).toContain('(image, 2KB)');
    expect(output).toContain('(video, 3.0MB)');
  });

  it('always ends with the implementation-context section', () => {
    const output = buildTicketMarkdown(ticket(), []);
    expect(output).toContain('## Contexto para implementación');
    expect(output.trimEnd().endsWith('(referencia interna de MayaHelp).')).toBe(
      true,
    );
  });
});
