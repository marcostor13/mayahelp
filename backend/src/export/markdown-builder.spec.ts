import {
  buildCombinedMarkdown,
  buildTicketMarkdown,
  ExportableAttachment,
  MarkdownableTicket,
  TicketWithAttachments,
} from './markdown-builder';

function ticket(
  overrides: Partial<MarkdownableTicket> = {},
): MarkdownableTicket {
  return {
    code: 'TCK-8001',
    subject: 'No carga el dashboard',
    description: 'Al entrar queda cargando para siempre.',
    status: 'abierto',
    priority: 'alta',
    client: { name: 'Ana Pérez', email: 'ana@ejemplo.com', company: 'Acme' },
    category: { name: 'Bug' },
    project: { name: 'Portal Acme' },
    assignedAgent: null,
    comments: [
      {
        authorName: 'Ana Pérez',
        message: 'Pasa en Chrome y en Safari.',
        createdAt: new Date('2026-07-01T10:00:00Z'),
      },
    ],
    createdAt: new Date('2026-07-01T09:00:00Z'),
    updatedAt: new Date('2026-07-02T09:00:00Z'),
    ...overrides,
  };
}

function attachment(
  overrides: Partial<ExportableAttachment> = {},
): ExportableAttachment {
  return {
    filename: 'captura.png',
    url: 'https://cdn.example.com/captura.png',
    downloadUrl: 'https://cdn.example.com/captura.png',
    kind: 'image',
    size: 2048,
    ...overrides,
  };
}

describe('buildTicketMarkdown', () => {
  it('includes metadata, conversation and attachments', () => {
    const markdown = buildTicketMarkdown(ticket(), [attachment()]);

    expect(markdown).toContain('# [TCK-8001] No carga el dashboard');
    expect(markdown).toContain('- **Prioridad:** alta');
    expect(markdown).toContain('- **Proyecto:** Portal Acme');
    expect(markdown).toContain('Pasa en Chrome y en Safari.');
    // Images use image syntax so Markdown viewers preview them inline.
    expect(markdown).toContain(
      '![captura.png](<https://cdn.example.com/captura.png>)',
    );
    expect(markdown).toContain('## Contexto para implementación');
  });

  it('writes the public download link and how to fetch it, not the stored url', () => {
    const markdown = buildTicketMarkdown(ticket(), [
      attachment({
        filename: 'log del error.txt',
        kind: 'document',
        size: 512,
        url: 'https://bucket.r2.cloudflarestorage.com/mayahelp/log.txt',
        downloadUrl: 'https://cdn.example.com/log.txt?sig=abc&exp=1',
      }),
    ]);

    // El link firmado trae query string: va entre <> para que no se corte.
    expect(markdown).toContain(
      '[log del error.txt](<https://cdn.example.com/log.txt?sig=abc&exp=1>)',
    );
    expect(markdown).not.toContain('r2.cloudflarestorage.com');
    // El comando lleva la URL pelada, sin el <> del link Markdown.
    expect(markdown).toContain(
      'curl -fsSL -o "/tmp/log-del-error.txt" "https://cdn.example.com/log.txt?sig=abc&exp=1"',
    );
    expect(markdown).toContain('Links de descarga directa');
  });

  it('falls back to the stored url when there is no resolved download link', () => {
    const markdown = buildTicketMarkdown(ticket(), [
      attachment({ downloadUrl: undefined }),
    ]);

    expect(markdown).toContain(
      '![captura.png](<https://cdn.example.com/captura.png>)',
    );
  });

  it('tells the AI to download the attachments before working', () => {
    const markdown = buildTicketMarkdown(ticket(), [attachment()]);

    expect(markdown).toContain('link de descarga directo');
  });

  it('omits the project line when the ticket has none', () => {
    const markdown = buildTicketMarkdown(ticket({ project: null }), []);

    expect(markdown).not.toContain('**Proyecto:**');
    expect(markdown).toContain('_Sin adjuntos._');
  });
});

describe('buildCombinedMarkdown', () => {
  const entries: TicketWithAttachments[] = [
    { ticket: ticket(), attachments: [attachment()] },
    {
      ticket: ticket({
        code: 'TCK-8002',
        subject: 'Error al exportar',
        priority: 'baja',
      }),
      attachments: [],
    },
  ];

  it('builds one document with an index linking to every ticket section', () => {
    const markdown = buildCombinedMarkdown(entries, {
      generatedAt: new Date('2026-07-30T12:00:00Z'),
      filterSummary: 'todos los tickets',
    });

    expect(markdown).toContain('# Tickets de MayaHelp');
    expect(markdown).toContain('2 ticket(s) exportados el 2026-07-30 12:00');
    expect(markdown).toContain('filtro: todos los tickets');
    expect(markdown).toContain('## Índice');
    // Index anchors must match the generated section headings.
    // GitHub-style slug of the heading "[TCK-8001] No carga el dashboard".
    expect(markdown).toContain(
      '[TCK-8001 — No carga el dashboard](#tck-8001-no-carga-el-dashboard)',
    );
    expect(markdown).toContain('## [TCK-8001] No carga el dashboard');
    expect(markdown).toContain('## [TCK-8002] Error al exportar');
    // Ticket headings are one level deeper, so their subsections stay nested.
    expect(markdown).toContain('### Descripción');
  });

  it('explains the empty result instead of producing a bare document', () => {
    const markdown = buildCombinedMarkdown([], {
      generatedAt: new Date('2026-07-30T12:00:00Z'),
    });

    expect(markdown).toContain('0 ticket(s) exportados');
    expect(markdown).toContain(
      '_No hay tickets que coincidan con el filtro seleccionado._',
    );
  });
});
