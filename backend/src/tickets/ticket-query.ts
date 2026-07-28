import { QueryFilter } from 'mongoose';
import { TicketDocument } from './schemas/ticket.schema';
import { FilterTicketDto } from './dto/filter-ticket.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { Role } from '../common/enums/role.enum';
import { escapeRegex } from '../common/search/escape-regex';

/** "TCK-8042", "tck8042", or just the start of one. */
const TICKET_CODE_PATTERN = /^tck-?\d*$/i;

export { escapeRegex };

export function looksLikeTicketCode(search: string): boolean {
  return TICKET_CODE_PATTERN.test(search.trim());
}

/**
 * Full-text search only matches whole words, which is wrong for a list filter where
 * people type prefixes ("factur"). So the service runs this query first and falls
 * back to {@link buildTicketSearchFallback} when it returns nothing.
 */
export function usesTextSearch(filter: FilterTicketDto): boolean {
  const search = filter.search?.trim();
  return Boolean(search) && !looksLikeTicketCode(search!);
}

function baseQuery(
  filter: FilterTicketDto,
  requester: AuthenticatedUser,
): QueryFilter<TicketDocument> {
  const query: QueryFilter<TicketDocument> = {};

  // A client only ever sees their own tickets, whatever else they ask for. The
  // client filter is applied only for staff — otherwise passing ?client=<someone
  // else> would overwrite this scope and hand a client another client's tickets.
  if (requester.role === Role.CLIENT) {
    query.client = requester.userId;
  } else if (filter.client) {
    query.client = filter.client;
  }
  if (filter.status) query.status = filter.status;
  if (filter.priority) query.priority = filter.priority;
  if (filter.category) query.category = filter.category;
  if (filter.project) query.project = filter.project;
  if (filter.assignedAgent) query.assignedAgent = filter.assignedAgent;
  if (filter.source) query.source = filter.source;

  return query;
}

export function buildTicketQuery(
  filter: FilterTicketDto,
  requester: AuthenticatedUser,
): QueryFilter<TicketDocument> {
  const query = baseQuery(filter, requester);
  const search = filter.search?.trim();
  if (!search) {
    return query;
  }

  if (looksLikeTicketCode(search)) {
    // Anchored so it can still use the unique index on `code`.
    query.code = { $regex: `^${escapeRegex(search)}`, $options: 'i' };
    return query;
  }

  // Top-level $text ANDs with the sibling filters — never nest it in an $or.
  query.$text = { $search: search };
  return query;
}

/** Substring search. Correct but unindexed, so it only runs when $text found nothing. */
export function buildTicketSearchFallback(
  filter: FilterTicketDto,
  requester: AuthenticatedUser,
): QueryFilter<TicketDocument> {
  const query = baseQuery(filter, requester);
  const search = escapeRegex(filter.search?.trim() ?? '');

  query.$or = [
    { subject: { $regex: search, $options: 'i' } },
    { code: { $regex: `^${search}`, $options: 'i' } },
  ];
  return query;
}
