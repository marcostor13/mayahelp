/**
 * HTML email layout for MayaHelp notifications.
 *
 * Written for email clients, not browsers: tables for layout, inline styles only, no
 * flex/grid and no external CSS — Gmail and Outlook drop <style> blocks and modern
 * layout properties. The logo is loaded from the public frontend so no attachment is needed.
 */

export type EmailAccent = 'primary' | 'success' | 'warning' | 'neutral';

export interface EmailRow {
  label: string;
  value: string;
}

export interface EmailAction {
  label: string;
  url: string;
}

export interface EmailContent {
  /** Shown by the inbox next to the subject; never rendered inside the message. */
  preheader: string;
  title: string;
  intro: string;
  accent?: EmailAccent;
  badge?: string;
  rows?: EmailRow[];
  /** Rendered as a quoted block — a comment, a description... */
  quote?: { author?: string; text: string };
  action?: EmailAction;
  footerNote?: string;
}

const COLORS = {
  background: '#f8f9ff',
  surface: '#ffffff',
  border: '#e2e8f5',
  text: '#121c2a',
  muted: '#5b6478',
  primary: '#5300b7',
  primarySoft: '#ebddff',
  success: '#0f7a4d',
  successSoft: '#d7f5e6',
  warning: '#8a5a00',
  warningSoft: '#fdf0d5',
  neutral: '#4a4455',
  neutralSoft: '#e9ecf5',
};

const ACCENTS: Record<EmailAccent, { color: string; soft: string }> = {
  primary: { color: COLORS.primary, soft: COLORS.primarySoft },
  success: { color: COLORS.success, soft: COLORS.successSoft },
  warning: { color: COLORS.warning, soft: COLORS.warningSoft },
  neutral: { color: COLORS.neutral, soft: COLORS.neutralSoft },
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif";

/** Email bodies embed values coming from tickets and users, so everything is escaped. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br />');
}

function renderRows(rows: EmailRow[]): string {
  const cells = rows
    .map(
      (row, index) => `
              <tr>
                <td style="padding:${index === 0 ? '0' : '10px'} 12px 0 0;font:400 13px/18px ${FONT};color:${COLORS.muted};white-space:nowrap;vertical-align:top;">${escapeHtml(row.label)}</td>
                <td style="padding:${index === 0 ? '0' : '10px'} 0 0 0;font:600 14px/20px ${FONT};color:${COLORS.text};vertical-align:top;">${escapeHtml(row.value)}</td>
              </tr>`,
    )
    .join('');

  return `
          <tr>
            <td style="padding:0 0 24px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLORS.background};border:1px solid ${COLORS.border};border-radius:12px;padding:16px;">
                ${cells}
              </table>
            </td>
          </tr>`;
}

function renderQuote(quote: NonNullable<EmailContent['quote']>): string {
  const author = quote.author
    ? `<p style="margin:0 0 6px 0;font:600 13px/18px ${FONT};color:${COLORS.primary};">${escapeHtml(quote.author)}</p>`
    : '';
  return `
          <tr>
            <td style="padding:0 0 24px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="border-left:3px solid ${COLORS.primarySoft};padding:2px 0 2px 14px;">
                    ${author}
                    <p style="margin:0;font:400 15px/23px ${FONT};color:${COLORS.text};">${nl2br(quote.text)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

function renderAction(action: EmailAction, accent: EmailAccent): string {
  const { color } = ACCENTS[accent];
  return `
          <tr>
            <td style="padding:0 0 8px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:${color};border-radius:12px;">
                    <a href="${escapeHtml(action.url)}" style="display:inline-block;padding:13px 26px;font:600 15px/20px ${FONT};color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(action.label)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

export function renderNotificationEmail(
  content: EmailContent,
  options: { appUrl: string },
): string {
  const accent = content.accent ?? 'primary';
  const { color, soft } = ACCENTS[accent];
  const appUrl = options.appUrl.replace(/\/$/, '');

  const badge = content.badge
    ? `<span style="display:inline-block;padding:5px 12px;margin:0 0 12px 0;background:${soft};color:${color};border-radius:999px;font:600 12px/16px ${FONT};text-transform:uppercase;letter-spacing:0.4px;">${escapeHtml(content.badge)}</span>`
    : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${escapeHtml(content.title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.background};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLORS.background};padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:20px;overflow:hidden;">
        <tr>
          <td style="padding:24px 28px 0 28px;">
            <a href="${escapeHtml(appUrl)}" style="text-decoration:none;">
              <img src="${escapeHtml(appUrl)}/mayahelp-logo.png" alt="MayaHelp" width="150" style="display:block;width:150px;max-width:150px;height:auto;border:0;" />
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px 0 28px;">
            <div style="height:4px;width:56px;background:${color};border-radius:999px;"></div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px 0 28px;">
            ${badge}
            <h1 style="margin:0 0 10px 0;font:700 23px/30px ${FONT};color:${COLORS.text};">${escapeHtml(content.title)}</h1>
            <p style="margin:0 0 22px 0;font:400 15px/23px ${FONT};color:${COLORS.muted};">${nl2br(content.intro)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              ${content.rows?.length ? renderRows(content.rows) : ''}
              ${content.quote ? renderQuote(content.quote) : ''}
              ${content.action ? renderAction(content.action, accent) : ''}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px 26px 28px;">
            <div style="height:1px;background:${COLORS.border};margin:0 0 16px 0;"></div>
            ${content.footerNote ? `<p style="margin:0 0 8px 0;font:400 13px/19px ${FONT};color:${COLORS.muted};">${nl2br(content.footerNote)}</p>` : ''}
            <p style="margin:0;font:400 12px/18px ${FONT};color:${COLORS.muted};">
              Este aviso lo envía <a href="${escapeHtml(appUrl)}" style="color:${COLORS.primary};text-decoration:none;font-weight:600;">MayaHelp</a>, la plataforma de soporte técnico.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Plain-text fallback: better deliverability and readable in text-only clients. */
export function renderNotificationText(content: EmailContent): string {
  const lines: string[] = [content.title, ''];
  lines.push(content.intro, '');
  for (const row of content.rows ?? []) {
    lines.push(`${row.label}: ${row.value}`);
  }
  if (content.rows?.length) lines.push('');
  if (content.quote) {
    if (content.quote.author) lines.push(`${content.quote.author}:`);
    lines.push(content.quote.text, '');
  }
  if (content.action) {
    lines.push(`${content.action.label}: ${content.action.url}`, '');
  }
  if (content.footerNote) lines.push(content.footerNote, '');
  lines.push('MayaHelp — Soporte técnico');
  return lines.join('\n');
}
