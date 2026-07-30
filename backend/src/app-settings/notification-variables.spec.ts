import {
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
