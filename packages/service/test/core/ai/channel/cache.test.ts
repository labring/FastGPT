import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCachedTypeMetas, resetChannelCache } from '@fastgpt/service/core/ai/channel/cache';

describe('channel type metas cache', () => {
  beforeEach(() => {
    resetChannelCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('caches type metas and reuses them within TTL', async () => {
    const fetcher = vi.fn().mockResolvedValue({ types: [1, 2, 3] });

    const first = await getCachedTypeMetas(fetcher);
    const second = await getCachedTypeMetas(fetcher);

    expect(first).toEqual({ types: [1, 2, 3] });
    expect(second).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refetches after TTL (10 minutes) expires', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ types: [1] })
      .mockResolvedValueOnce({ types: [1, 2] });

    const first = await getCachedTypeMetas(fetcher);
    expect(first).toEqual({ types: [1] });

    vi.advanceTimersByTime(11 * 60_000);

    const second = await getCachedTypeMetas(fetcher);
    expect(second).toEqual({ types: [1, 2] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent inflight calls', async () => {
    let resolvePromise: (val: any) => void;
    const inflightPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    const fetcher = vi.fn().mockImplementation(() => inflightPromise);

    const call1 = getCachedTypeMetas(fetcher);
    const call2 = getCachedTypeMetas(fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);

    resolvePromise!({ types: ['coalesced'] });

    const [res1, res2] = await Promise.all([call1, call2]);
    expect(res1).toEqual({ types: ['coalesced'] });
    expect(res2).toEqual({ types: ['coalesced'] });
  });

  it('clears cache on resetChannelCache', async () => {
    const fetcher = vi.fn().mockResolvedValue({ types: [1] });

    await getCachedTypeMetas(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);

    resetChannelCache();

    await getCachedTypeMetas(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
