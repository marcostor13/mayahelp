import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  paginate,
  resolvePagination,
} from './pagination';

describe('resolvePagination', () => {
  it('defaults to the first page and the default size', () => {
    expect(resolvePagination({})).toEqual({
      page: 1,
      limit: DEFAULT_PAGE_SIZE,
      skip: 0,
    });
  });

  it('computes skip from page and limit', () => {
    expect(resolvePagination({ page: 3, limit: 20 })).toEqual({
      page: 3,
      limit: 20,
      skip: 40,
    });
  });

  it('caps the limit so a client cannot ask for the whole collection', () => {
    expect(resolvePagination({ limit: 100_000 }).limit).toBe(MAX_PAGE_SIZE);
  });

  it('clamps nonsensical values instead of producing a negative skip', () => {
    expect(resolvePagination({ page: 0, limit: 0 })).toEqual({
      page: 1,
      limit: 1,
      skip: 0,
    });
    expect(resolvePagination({ page: -5 }).skip).toBe(0);
  });

  it('truncates fractional input', () => {
    expect(resolvePagination({ page: 2.9, limit: 10.7 })).toEqual({
      page: 2,
      limit: 10,
      skip: 10,
    });
  });
});

describe('paginate', () => {
  it('reports the total number of pages', () => {
    const result = paginate(['a', 'b'], 21, { page: 1, limit: 10, skip: 0 });
    expect(result).toEqual({
      items: ['a', 'b'],
      total: 21,
      page: 1,
      limit: 10,
      totalPages: 3,
    });
  });

  it('reports zero pages for an empty result instead of one empty page', () => {
    expect(paginate([], 0, { page: 1, limit: 10, skip: 0 }).totalPages).toBe(0);
  });

  it('does not round a partial page down', () => {
    expect(paginate([], 11, { page: 1, limit: 10, skip: 0 }).totalPages).toBe(
      2,
    );
  });
});
