import {
  buildTicketSummary,
  NOTIFICATION_VARIABLES,
  NotificationContext,
  resolveVariable,
  resolveVariables,
} from './notification-variables';

const context: NotificationContext = {
  code: 'TCK-8001',
  subject: 'No carga\nel dashboard',
  description: '   ',
  status: 'abierto',
  priority: 'alta',
  category: 'Bug',
  project: 'Portal Acme',
  clientName: 'Ana Pérez',
  clientEmail: 'ana@ejemplo.com',
  recipientName: 'Soporte',
  event: 'Nuevo ticket',
  link: 'https://app.example.com/tickets/1',
};

describe('resolveVariables', () => {
  it('maps tokens positionally, in the configured order', () => {
    expect(
      resolveVariables(['{{code}}', '{{client_name}}', '{{status}}'], context),
    ).toEqual(['TCK-8001', 'Ana Pérez', 'abierto']);
  });

  it('collapses newlines, because Meta rejects multi-line template parameters', () => {
    expect(resolveVariable('{{subject}}', context)).toBe(
      'No carga el dashboard',
    );
  });

  it('falls back to a dash when a value resolves empty', () => {
    // Meta also rejects empty parameters, which would silently drop the notification.
    expect(resolveVariable('{{description}}', context)).toBe('-');
    expect(resolveVariable('{{author}}', context)).toBe('-');
  });

  it('passes unknown tokens through as literal text', () => {
    expect(resolveVariable('MayaHelp', context)).toBe('MayaHelp');
  });

  it('truncates very long values instead of getting rejected by the API', () => {
    const long = 'x'.repeat(900);
    const resolved = resolveVariable('{{message}}', {
      ...context,
      message: long,
    });

    expect(resolved.length).toBe(500);
    expect(resolved.endsWith('…')).toBe(true);
  });
});

describe('{{ticket_completo}}', () => {
  const full: NotificationContext = {
    ...context,
    subject: 'No carga el dashboard',
    description: 'Al entrar al panel queda cargando indefinidamente.',
  };

  it('lists every field in a fixed reading order, with the status included', () => {
    expect(resolveVariable('{{ticket_completo}}', full)).toBe(
      'TCK-8001 · Asunto: No carga el dashboard · Estado: abierto · Prioridad: alta · ' +
        'Categoría: Bug · Proyecto: Portal Acme · Cliente: Ana Pérez (ana@ejemplo.com) · ' +
        'Descripción: Al entrar al panel queda cargando indefinidamente. · ' +
        'Ver: https://app.example.com/tickets/1',
    );
  });

  it('stays on a single line even when the ticket text has line breaks', () => {
    const summary = buildTicketSummary({
      ...full,
      subject: 'No carga\nel dashboard',
      description: 'Pasa en Chrome\ny en Safari.\t Siempre.',
    });

    expect(summary).not.toMatch(/[\n\t]/);
    expect(summary).toContain('Asunto: No carga el dashboard');
    expect(summary).toContain(
      'Descripción: Pasa en Chrome y en Safari. Siempre.',
    );
  });

  it('skips the fields the ticket does not have', () => {
    const summary = buildTicketSummary({
      code: 'TCK-9000',
      subject: 'Sin categoría ni proyecto',
      status: 'abierto',
      event: 'Nuevo ticket',
      link: 'https://app.example.com/tickets/2',
    });

    expect(summary).toBe(
      'TCK-9000 · Asunto: Sin categoría ni proyecto · Estado: abierto · ' +
        'Ver: https://app.example.com/tickets/2',
    );
  });

  it('keeps the status and the link when the description is huge', () => {
    // The description is filled last with the leftover budget, so the fields that
    // identify the ticket can never be pushed out of the 500-char parameter limit.
    const summary = buildTicketSummary({
      ...full,
      description: 'x'.repeat(2000),
    });

    expect(summary.length).toBeLessThanOrEqual(500);
    expect(summary).toContain('Estado: abierto');
    expect(summary).toContain('Prioridad: alta');
    expect(summary).toContain('Ver: https://app.example.com/tickets/1');
    expect(summary).toContain('Descripción: xxx');
    expect(summary).toContain('…');
  });

  it('is offered as the first variable, with a real example of its output', () => {
    const [first] = NOTIFICATION_VARIABLES;

    expect(first.token).toBe('{{ticket_completo}}');
    // The example is produced by the resolver itself, so it cannot drift from reality.
    expect(first.example).toContain('Estado: abierto');
    expect(first.example).toContain('Cliente: Ana Pérez (ana@acme.com)');
  });
});
