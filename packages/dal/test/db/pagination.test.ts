import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, normalizePageParams } from '../../db';

describe('normalizePageParams', () => {
  it('keeps valid 1-based params and computes skip', () => {
    expect(normalizePageParams({ page: 3, pageSize: 20 })).toEqual({ skip: 40, limit: 20 });
  });

  it('falls back to defaults for missing or invalid params', () => {
    expect(normalizePageParams({ page: 0, pageSize: 0 })).toEqual({
      skip: 0,
      limit: DEFAULT_PAGE_SIZE
    });
    expect(normalizePageParams({ page: 1.5, pageSize: -1 })).toEqual({
      skip: 0,
      limit: DEFAULT_PAGE_SIZE
    });
    expect(normalizePageParams({ page: NaN, pageSize: NaN })).toEqual({
      skip: 0,
      limit: DEFAULT_PAGE_SIZE
    });
  });

  it('clamps pageSize to the max limit', () => {
    expect(normalizePageParams({ page: 1, pageSize: 1000 })).toEqual({
      skip: 0,
      limit: MAX_PAGE_SIZE
    });
  });

  it('honors custom defaults and limits', () => {
    expect(
      normalizePageParams({ page: 2, pageSize: 300 }, { defaultPageSize: 25, maxPageSize: 200 })
    ).toEqual({ skip: 200, limit: 200 });
  });
});
