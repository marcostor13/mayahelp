import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export class PaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  @IsOptional()
  limit?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ResolvedPagination {
  page: number;
  limit: number;
  skip: number;
}

/**
 * Clamps whatever arrived on the query string into a page/limit we are willing to
 * run. `limit` is already capped by the DTO, but this is also called from places
 * that build a filter by hand, so it re-clamps instead of trusting the caller.
 */
export function resolvePagination(query: {
  page?: number;
  limit?: number;
}): ResolvedPagination {
  const page = Math.max(1, Math.trunc(query.page ?? 1));
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(query.limit ?? DEFAULT_PAGE_SIZE)),
  );
  return { page, limit, skip: (page - 1) * limit };
}

export function paginate<T>(
  items: T[],
  total: number,
  { page, limit }: ResolvedPagination,
): Paginated<T> {
  return {
    items,
    total,
    page,
    limit,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}
