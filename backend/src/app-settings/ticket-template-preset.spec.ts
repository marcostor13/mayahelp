import {
  buildTicketTemplatePreset,
  TICKET_TEMPLATE_PRESET_BODY,
  TICKET_TEMPLATE_PRESET_VARIABLES,
} from './ticket-template-preset';
import { NOTIFICATION_VARIABLES } from './notification-variables';

describe('ticket template preset', () => {
  const preset = buildTicketTemplatePreset();

  it('puts the line breaks in the template body, which is where WhatsApp allows them', () => {
    expect(TICKET_TEMPLATE_PRESET_BODY).toContain('\n');
    expect(TICKET_TEMPLATE_PRESET_BODY).toContain('🔄 Estado: {{3}}');
  });

  it('maps exactly one token per placeholder of the body', () => {
    const placeholders = new Set(
      [...TICKET_TEMPLATE_PRESET_BODY.matchAll(/\{\{(\d+)\}\}/g)].map(
        (match) => match[1],
      ),
    );

    expect(placeholders.size).toBe(TICKET_TEMPLATE_PRESET_VARIABLES.length);
    // Placeholders are 1-based and consecutive, so position N fills {{N}}.
    expect([...placeholders].sort((a, b) => Number(a) - Number(b))).toEqual(
      TICKET_TEMPLATE_PRESET_VARIABLES.map((_, index) => String(index + 1)),
    );
  });

  it('only uses tokens the resolver knows about', () => {
    const known = new Set(NOTIFICATION_VARIABLES.map((v) => v.token));

    for (const token of TICKET_TEMPLATE_PRESET_VARIABLES) {
      expect(known.has(token)).toBe(true);
    }
  });

  it('ships one example per variable, as Meta requires for approval', () => {
    expect(preset.bodyExamples).toHaveLength(
      TICKET_TEMPLATE_PRESET_VARIABLES.length,
    );
    expect(preset.bodyExamples?.every((value) => value.length > 0)).toBe(true);
    // Examples are single-line: a template parameter can never contain newlines.
    expect(preset.bodyExamples?.some((value) => value.includes('\n'))).toBe(
      false,
    );
  });

  it('is a utility template with a valid Meta name', () => {
    expect(preset.category).toBe('UTILITY');
    expect(preset.name).toMatch(/^[a-z0-9_]+$/);
  });
});
