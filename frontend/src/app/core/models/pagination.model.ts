/** Shape returned by every paginated list endpoint of the API. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const EMPTY_PAGE: Paginated<never> = {
  items: [],
  total: 0,
  page: 1,
  limit: 25,
  totalPages: 0,
};
