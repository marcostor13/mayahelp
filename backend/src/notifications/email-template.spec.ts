import {
  EmailContent,
  renderNotificationEmail,
  renderNotificationText,
} from './email-template';

const content: EmailContent = {
  preheader: 'Registramos tu ticket TCK-8001.',
  badge: 'Nuevo ticket',
  title: 'No carga el dashboard',
  intro: 'Entró un ticket nuevo de Ana Pérez.',
  accent: 'success',
  rows: [
    { label: 'Ticket', value: 'TCK-8001' },
    { label: 'Estado', value: 'Resuelto' },
  ],
  quote: { author: 'Ana Pérez', text: 'Primera línea.\nSegunda línea.' },
  action: { label: 'Ver el ticket', url: 'https://app.example.com/tickets/1' },
};

describe('renderNotificationEmail', () => {
  const html = renderNotificationEmail(content, {
    appUrl: 'https://app.example.com/',
  });

  it('shows the logo served by the frontend, without a trailing double slash', () => {
    expect(html).toContain('src="https://app.example.com/mayahelp-logo.png"');
    expect(html).not.toContain('.com//mayahelp-logo.png');
  });

  it('renders the ticket data, the quote and the call to action', () => {
    expect(html).toContain('TCK-8001');
    expect(html).toContain('Resuelto');
    expect(html).toContain('Ana Pérez');
    expect(html).toContain('href="https://app.example.com/tickets/1"');
    expect(html).toContain('Ver el ticket');
  });

  it('keeps line breaks of quoted text as <br />', () => {
    expect(html).toContain('Primera línea.<br />Segunda línea.');
  });

  it('uses the accent colour of the chosen status', () => {
    // Success accent, so the rule and the button are green rather than purple.
    expect(html).toContain('#0f7a4d');
  });

  it('escapes values coming from tickets and users', () => {
    const escaped = renderNotificationEmail(
      {
        ...content,
        title: '<script>alert(1)</script>',
        quote: { text: 'a & b < c' },
      },
      { appUrl: 'https://app.example.com' },
    );

    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escaped).toContain('a &amp; b &lt; c');
  });

  it('lays out with tables and inline styles, which is what email clients support', () => {
    expect(html).toContain('role="presentation"');
    expect(html).not.toContain('display:flex');
    expect(html).not.toContain('<style');
  });

  it('hides the preheader from the body but keeps it for the inbox preview', () => {
    expect(html).toContain('Registramos tu ticket TCK-8001.');
    expect(html).toContain('max-height:0');
  });
});

describe('renderNotificationText', () => {
  it('produces a readable plain-text alternative', () => {
    const text = renderNotificationText(content);

    expect(text).toContain('No carga el dashboard');
    expect(text).toContain('Ticket: TCK-8001');
    expect(text).toContain('Estado: Resuelto');
    expect(text).toContain('Ver el ticket: https://app.example.com/tickets/1');
    expect(text).not.toContain('<');
  });
});
