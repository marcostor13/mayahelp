import {
  buildTicketQuery,
  buildTicketSearchFallback,
  escapeRegex,
  looksLikeTicketCode,
  usesTextSearch,
} from './ticket-query';
import { FilterTicketDto } from './dto/filter-ticket.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { Role } from '../common/enums/role.enum';
import { TicketPriority, TicketStatus } from '../common/enums/ticket.enum';

const client: AuthenticatedUser = {
  userId: '507f1f77bcf86cd799439011',
  email: 'cliente@example.com',
  role: Role.CLIENT,
};
const agent: AuthenticatedUser = {
  userId: '507f1f77bcf86cd799439012',
  email: 'agente@example.com',
  role: Role.AGENT,
};

function filter(overrides: Partial<FilterTicketDto> = {}): FilterTicketDto {
  return overrides;
}

describe('escapeRegex', () => {
  it('neutralises metacharacters so user input cannot break the query', () => {
    expect(escapeRegex('pago (urgente)')).toBe('pago \\(urgente\\)');
    expect(escapeRegex('a.b*c')).toBe('a\\.b\\*c');
  });

  it('leaves plain text untouched', () => {
    expect(escapeRegex('facturación')).toBe('facturación');
  });
});

describe('looksLikeTicketCode', () => {
  it.each(['TCK-8042', 'tck8042', 'TCK-', 'tck'])('accepts %s', (input) => {
    expect(looksLikeTicketCode(input)).toBe(true);
  });

  it.each(['factura', '8042', 'TCK 8042', 'error de tck'])(
    'rejects %s',
    (input) => {
      expect(looksLikeTicketCode(input)).toBe(false);
    },
  );
});

describe('buildTicketQuery', () => {
  it('forces a client to their own tickets', () => {
    expect(buildTicketQuery(filter(), client)).toEqual({
      client: client.userId,
    });
  });

  it('does not scope agents to a client', () => {
    expect(buildTicketQuery(filter(), agent)).toEqual({});
  });

  it('keeps the client scope even when other filters are present', () => {
    const query = buildTicketQuery(
      filter({ status: TicketStatus.ABIERTO, priority: TicketPriority.ALTA }),
      client,
    );
    expect(query).toEqual({
      client: client.userId,
      status: TicketStatus.ABIERTO,
      priority: TicketPriority.ALTA,
    });
  });

  it('maps every supported filter', () => {
    const query = buildTicketQuery(
      filter({
        status: TicketStatus.EN_PROCESO,
        priority: TicketPriority.BAJA,
        category: '507f1f77bcf86cd799439013',
        project: '507f1f77bcf86cd799439014',
        assignedAgent: '507f1f77bcf86cd799439015',
      }),
      agent,
    );
    expect(query).toEqual({
      status: TicketStatus.EN_PROCESO,
      priority: TicketPriority.BAJA,
      category: '507f1f77bcf86cd799439013',
      project: '507f1f77bcf86cd799439014',
      assignedAgent: '507f1f77bcf86cd799439015',
    });
  });

  it('lets staff filter by client', () => {
    const query = buildTicketQuery(
      filter({ client: '507f1f77bcf86cd799439016' }),
      agent,
    );
    expect(query.client).toBe('507f1f77bcf86cd799439016');
  });

  it('ignores a client filter coming from a client, instead of escalating', () => {
    const query = buildTicketQuery(
      filter({ client: '507f1f77bcf86cd799439016' }),
      client,
    );
    expect(query.client).toBe(client.userId);
  });

  it('ignores a client filter coming from a client in the fallback search too', () => {
    const query = buildTicketSearchFallback(
      filter({ search: 'factur', client: '507f1f77bcf86cd799439016' }),
      client,
    );
    expect(query.client).toBe(client.userId);
  });

  it('uses an anchored code regex when the search looks like a ticket code', () => {
    const query = buildTicketQuery(filter({ search: 'TCK-80' }), agent);
    expect(query).toEqual({ code: { $regex: '^TCK-80', $options: 'i' } });
    expect(query.$text).toBeUndefined();
  });

  it('uses full-text search for anything else', () => {
    const query = buildTicketQuery(
      filter({ search: 'factura duplicada' }),
      agent,
    );
    expect(query).toEqual({ $text: { $search: 'factura duplicada' } });
  });

  it('never nests $text inside an $or', () => {
    const query = buildTicketQuery(
      filter({ search: 'factura', status: TicketStatus.ABIERTO }),
      agent,
    );
    expect(query.$or).toBeUndefined();
    expect(query.$text).toEqual({ $search: 'factura' });
    expect(query.status).toBe(TicketStatus.ABIERTO);
  });

  it('ignores a blank search', () => {
    expect(buildTicketQuery(filter({ search: '   ' }), agent)).toEqual({});
  });
});

describe('usesTextSearch', () => {
  it('is true only for a non-code, non-empty search', () => {
    expect(usesTextSearch(filter({ search: 'factura' }))).toBe(true);
    expect(usesTextSearch(filter({ search: 'TCK-8042' }))).toBe(false);
    expect(usesTextSearch(filter({ search: '  ' }))).toBe(false);
    expect(usesTextSearch(filter())).toBe(false);
  });
});

describe('buildTicketSearchFallback', () => {
  it('falls back to a substring match on subject and code', () => {
    const query = buildTicketSearchFallback(
      filter({ search: 'factur' }),
      agent,
    );
    expect(query.$or).toEqual([
      { subject: { $regex: 'factur', $options: 'i' } },
      { code: { $regex: '^factur', $options: 'i' } },
    ]);
  });

  it('escapes the search before building the regex', () => {
    const query = buildTicketSearchFallback(
      filter({ search: 'pago (urgente)' }),
      agent,
    );
    expect(query.$or?.[0]).toEqual({
      subject: { $regex: 'pago \\(urgente\\)', $options: 'i' },
    });
  });

  it('still scopes a client to their own tickets', () => {
    const query = buildTicketSearchFallback(
      filter({ search: 'factur' }),
      client,
    );
    expect(query.client).toBe(client.userId);
  });
});
