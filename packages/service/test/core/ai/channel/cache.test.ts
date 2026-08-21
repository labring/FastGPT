import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCachedChannels,
  invalidateGroupChannelCache,
  invalidateSystemChannelCache,
  resetChannelCache
} from '@fastgpt/service/core/ai/channel/cache';
import type { AiproxyChannel } from '@fastgpt/service/core/ai/channel/api';

const makeChannel = (id: number): AiproxyChannel => ({
  id,
  name: `ch-${id}`,
  type: 1,
  status: 1,
  models: ['gpt-4o']
});

describe('channel bucket cache', () => {
  beforeEach(() => {
    resetChannelCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the fetched list and reuses it within the TTL (no refetch)', async () => {
    const fetchAll = vi.fn().mockResolvedValue([makeChannel(1), makeChannel(2)]);

    const first = await getCachedChannels(fetchAll, 'bucket-a');
    const second = await getCachedChannels(fetchAll, 'bucket-a');

    expect(first).toHaveLength(2);
    expect(second).toBe(first); // same cached array reference
    expect(fetchAll).toHaveBeenCalledTimes(1);
  });

  it('refetches after the TTL expires (30s)', async () => {
    const fetchAll = vi.fn().mockResolvedValue([makeChannel(1)]);

    await getCachedChannels(fetchAll, 'bucket-a');
    vi.advanceTimersByTime(31_000);
    await getCachedChannels(fetchAll, 'bucket-a');

    expect(fetchAll).toHaveBeenCalledTimes(2);
  });

  it('keeps buckets independent', async () => {
    const fetchA = vi.fn().mockResolvedValue([makeChannel(1)]);
    const fetchB = vi.fn().mockResolvedValue([makeChannel(2)]);

    await getCachedChannels(fetchA, 'bucket-a');
    await getCachedChannels(fetchB, 'bucket-b');
    await getCachedChannels(fetchA, 'bucket-a');
    await getCachedChannels(fetchB, 'bucket-b');

    expect(fetchA).toHaveBeenCalledTimes(1);
    expect(fetchB).toHaveBeenCalledTimes(1);
  });

  it('invalidateGroupChannelCache drops that group bucket and the global aggregate', async () => {
    const fetchGroup = vi.fn().mockResolvedValue([makeChannel(1)]);
    const fetchGlobal = vi.fn().mockResolvedValue([makeChannel(1)]);

    await getCachedChannels(fetchGroup, 'fastgpt:tmb:member-a');
    await getCachedChannels(fetchGlobal, '__globalGroups__');

    invalidateGroupChannelCache('fastgpt:tmb:member-a');

    await getCachedChannels(fetchGroup, 'fastgpt:tmb:member-a');
    await getCachedChannels(fetchGlobal, '__globalGroups__');

    expect(fetchGroup).toHaveBeenCalledTimes(2);
    expect(fetchGlobal).toHaveBeenCalledTimes(2);
  });

  it('invalidateGroupChannelCache leaves other groups untouched', async () => {
    const fetchA = vi.fn().mockResolvedValue([makeChannel(1)]);
    const fetchB = vi.fn().mockResolvedValue([makeChannel(2)]);

    await getCachedChannels(fetchA, 'fastgpt:tmb:member-a');
    await getCachedChannels(fetchB, 'fastgpt:tmb:member-b');

    invalidateGroupChannelCache('fastgpt:tmb:member-a');
    await getCachedChannels(fetchA, 'fastgpt:tmb:member-a');
    await getCachedChannels(fetchB, 'fastgpt:tmb:member-b');

    expect(fetchA).toHaveBeenCalledTimes(2);
    expect(fetchB).toHaveBeenCalledTimes(1); // untouched bucket stays cached
  });

  it('invalidateSystemChannelCache only drops the system bucket', async () => {
    const fetchSystem = vi.fn().mockResolvedValue([makeChannel(1)]);
    const fetchGroup = vi.fn().mockResolvedValue([makeChannel(2)]);

    await getCachedChannels(fetchSystem, '__system__');
    await getCachedChannels(fetchGroup, 'fastgpt:tmb:member-a');

    invalidateSystemChannelCache();
    await getCachedChannels(fetchSystem, '__system__');
    await getCachedChannels(fetchGroup, 'fastgpt:tmb:member-a');

    expect(fetchSystem).toHaveBeenCalledTimes(2); // refetched
    expect(fetchGroup).toHaveBeenCalledTimes(1); // untouched
  });
});
