import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  GET: vi.fn()
}));

vi.mock('@/web/admin/common/request', () => ({
  GET: mocks.GET
}));

import { getDatasetSearchPerfEvents, getDatasetSearchPerfOverview } from '@/web/admin/ops/api';

describe('admin ops performance api boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when overview request degrades to silentDegrade404 empty list payload', async () => {
    mocks.GET.mockResolvedValueOnce({ total: 0, list: [] });
    const res = await getDatasetSearchPerfOverview({ rangeHours: 24 });
    expect(res).toBeUndefined();
  });

  it('returns overview payload when pro service responds with valid overview shape', async () => {
    const validPayload = {
      meta: { vectorEngine: 'pg', fullTextEngine: 'mongo', bucketGranularity: 'hour' },
      summary: { totalCount: 10 },
      trend: [],
      stageStats: []
    };
    mocks.GET.mockResolvedValueOnce(validPayload);
    const res = await getDatasetSearchPerfOverview({ rangeHours: 24 });
    expect(res).toEqual(validPayload);
  });

  it('normalizes malformed events payload to empty pagination shape', async () => {
    mocks.GET.mockResolvedValueOnce(undefined);
    const res = await getDatasetSearchPerfEvents({ rangeHours: 24 });
    expect(res).toEqual({ total: 0, list: [] });
  });
});
