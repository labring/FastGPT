import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemModelItemType } from '@fastgpt/service/core/ai/model/type';

/**
 * Performance verification for the cache-aware channel client (design §2.9.5):
 * the cache lives at the api.ts layer, so reads hit aiproxy once per bucket per
 * TTL and writes invalidate automatically. Each axiosMock call == one HTTP
 * round trip to aiproxy — every case asserts axiosMock.mock.calls.length.
 */

const { axiosMock, getConfigMock } = vi.hoisted(() => ({
  axiosMock: vi.fn(),
  getConfigMock: vi.fn(() => ({ baseUrl: 'http://aiproxy.test', token: 'test-token' }))
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  axiosWithoutSSRF: axiosMock
}));

vi.mock('@fastgpt/service/thirdProvider/aiproxy/config', () => ({
  getAIProxyAdminConfig: getConfigMock
}));

import {
  createGroupChannel,
  createSystemChannel,
  deleteGroupChannel,
  deleteSystemChannel,
  getRealtimeSystemChannels,
  listGlobalGroupChannels,
  listGroupChannels,
  listSystemChannels,
  testGroupChannel,
  testSystemChannel,
  updateGroupChannel,
  updateGroupChannelStatus,
  updateSystemChannel,
  updateSystemChannelStatus
} from '@fastgpt/service/core/ai/channel/api';
import {
  getChannelAffectedModels,
  getModelChannelsMapByModels,
  getSystemChannelList
} from '@fastgpt/service/core/ai/channel/controller';
import { resetChannelCache } from '@fastgpt/service/core/ai/channel/cache';
import type { AiproxyChannel, AiproxyGroupChannel } from '@fastgpt/service/core/ai/channel/api';

const okEnvelope = (data: unknown) => ({ data: { success: true, data } });

const makeChannel = (id: number, overrides: Partial<AiproxyChannel> = {}): AiproxyChannel => ({
  id,
  name: `ch-${id}`,
  type: 1,
  status: 1,
  models: [],
  ...overrides
});

const makeGroupChannel = (
  id: number,
  groupId: string,
  overrides: Partial<AiproxyGroupChannel> = {}
): AiproxyGroupChannel => ({
  ...makeChannel(id),
  group_id: groupId,
  ...overrides
});

const makeModel = (id: string, overrides: Partial<SystemModelItemType> = {}): SystemModelItemType =>
  ({
    type: 'llm',
    provider: 'test',
    model: 'gpt-4o',
    name: `Model ${id}`,
    isActive: true,
    isSystem: true,
    id,
    ...overrides
  }) as SystemModelItemType;

/** Route axios mock by URL prefix — one entry per aiproxy list endpoint */
const mockRoutes = (routes: Array<{ match: (url: string) => boolean; data: unknown }>) => {
  axiosMock.mockImplementation((config: { url: string }) => {
    const route = routes.find((r) => r.match(config.url));
    if (!route) return Promise.reject(new Error(`unmocked url: ${config.url}`));
    return Promise.resolve(okEnvelope(route.data));
  });
};

const SYSTEM_CHANNELS: AiproxyChannel[] = [
  makeChannel(101, { models: ['gpt-4o'] }),
  makeChannel(102, { models: ['claude-3-5-sonnet'] })
];

const GROUP_A = encodeURIComponent('fastgpt:tmb:tmb-a');
const GROUP_B = encodeURIComponent('fastgpt:tmb:tmb-b');

const mockDefaultRoutes = () =>
  mockRoutes([
    {
      match: (url) => url.startsWith('http://aiproxy.test/api/channels/'),
      data: { channels: SYSTEM_CHANNELS, total: SYSTEM_CHANNELS.length }
    }
  ]);

describe('channel cache performance — HTTP round trips', () => {
  beforeEach(() => {
    axiosMock.mockReset();
    resetChannelCache();
    globalThis.systemModelList = [];
    globalThis.systemModelIdMap = new Map();
  });

  it('cold vs hot list: 1 round trip cold, 0 warm (getSystemChannelList x2)', async () => {
    mockDefaultRoutes();

    await getSystemChannelList();
    expect(axiosMock.mock.calls).toHaveLength(1); // cold: one paginated fetch

    await getSystemChannelList();
    expect(axiosMock.mock.calls).toHaveLength(1); // hot: served from the bucket
  });

  it('multi-owner model map: 1(system) + N(owner) round trips cold, 0 warm', async () => {
    const models = [
      makeModel('sys-1', { model: 'gpt-4o', isSystem: true }),
      makeModel('own-a-1', { model: 'qwen-plus', isSystem: false, tmbId: 'tmb-a' }),
      makeModel('own-b-1', { model: 'deepseek-v3', isSystem: false, tmbId: 'tmb-b' })
    ];
    globalThis.systemModelList = models;
    globalThis.systemModelIdMap = new Map(models.map((m) => [m.id, m]));

    mockRoutes([
      {
        match: (url) => url.startsWith('http://aiproxy.test/api/channels/'),
        data: { channels: [makeChannel(101, { models: ['gpt-4o'] })], total: 1 }
      },
      {
        match: (url) => url.startsWith(`http://aiproxy.test/api/group/${GROUP_A}/channels/`),
        data: {
          channels: [makeGroupChannel(201, 'fastgpt:tmb:tmb-a', { models: ['qwen-plus'] })],
          total: 1
        }
      },
      {
        match: (url) => url.startsWith(`http://aiproxy.test/api/group/${GROUP_B}/channels/`),
        data: {
          channels: [makeGroupChannel(301, 'fastgpt:tmb:tmb-b', { models: ['deepseek-v3'] })],
          total: 1
        }
      }
    ]);

    await getModelChannelsMapByModels(models);
    expect(axiosMock.mock.calls).toHaveLength(3); // 1 system bucket + 2 owner buckets

    await getModelChannelsMapByModels(models);
    expect(axiosMock.mock.calls).toHaveLength(3); // all buckets warm — 0 round trips
  });

  it('pagination bucket: 150 channels = 2 round trips cold, 0 warm', async () => {
    const paged = Array.from({ length: 150 }, (_, i) => makeChannel(1000 + i));
    mockRoutes([
      {
        match: (url) =>
          /\?page=1(&|$)/.test(url) && url.startsWith('http://aiproxy.test/api/channels/'),
        data: { channels: paged.slice(0, 100), total: 150 }
      },
      {
        match: (url) =>
          /\?page=2(&|$)/.test(url) && url.startsWith('http://aiproxy.test/api/channels/'),
        data: { channels: paged.slice(100), total: 150 }
      }
    ]);

    const all = await (await listSystemChannels()).channels;
    expect(all).toHaveLength(150);
    expect(axiosMock.mock.calls).toHaveLength(2); // page=1 + page=2

    await (
      await listSystemChannels()
    ).channels;
    expect(axiosMock.mock.calls).toHaveLength(2); // hot: bucket served, no refetch
  });

  it('failed fetch does not poison the bucket (refetch on next read)', async () => {
    mockDefaultRoutes();
    axiosMock.mockRejectedValueOnce(new Error('network down'));

    await expect(listSystemChannels()).rejects.toThrow('network down');
    expect(axiosMock.mock.calls).toHaveLength(1); // the failed attempt

    const channels = await (await listSystemChannels()).channels;
    expect(channels).toHaveLength(2);
    expect(axiosMock.mock.calls).toHaveLength(2); // refetched — bucket was not written on failure

    await (
      await listSystemChannels()
    ).channels;
    expect(axiosMock.mock.calls).toHaveLength(2); // now warm
  });

  it('write ops invalidate automatically: read → write → read refetches', async () => {
    mockRoutes([
      {
        match: (url) => url.startsWith('http://aiproxy.test/api/channels/'),
        data: { channels: SYSTEM_CHANNELS, total: SYSTEM_CHANNELS.length }
      },
      { match: (url) => url.endsWith('/api/channel/12/status'), data: null },
      {
        match: (url) => url.endsWith('/api/group/fastgpt%3Atmb%3Atmb-a/channel/12/status'),
        data: null
      },
      {
        match: (url) => url.startsWith(`http://aiproxy.test/api/group/${GROUP_A}/channels/`),
        data: { channels: [], total: 0 }
      }
    ]);

    await (
      await listSystemChannels()
    ).channels;
    expect(axiosMock.mock.calls).toHaveLength(1);

    await updateSystemChannelStatus(12, 2); // success → system bucket dropped
    expect(axiosMock.mock.calls).toHaveLength(2);

    await (
      await listSystemChannels()
    ).channels;
    expect(axiosMock.mock.calls).toHaveLength(3); // invalidated → refetched

    // group side: status write invalidates the group bucket too
    await (
      await listGroupChannels('fastgpt:tmb:tmb-a')
    ).channels;
    expect(axiosMock.mock.calls).toHaveLength(4);

    await updateGroupChannelStatus('fastgpt:tmb:tmb-a', 12, 1);
    expect(axiosMock.mock.calls).toHaveLength(5);

    await (
      await listGroupChannels('fastgpt:tmb:tmb-a')
    ).channels;
    expect(axiosMock.mock.calls).toHaveLength(6); // invalidated → refetched
  });

  it('realtime entry points never read the cache (delete-protection red line)', async () => {
    globalThis.systemModelList = [makeModel('sys-1', { model: 'gpt-4o', isSystem: true })];
    mockDefaultRoutes();

    await (
      await listSystemChannels()
    ).channels; // warm the system bucket
    expect(axiosMock.mock.calls).toHaveLength(1);

    await getRealtimeSystemChannels(); // realtime ignores the warm bucket
    expect(axiosMock.mock.calls).toHaveLength(2);

    await (
      await listSystemChannels()
    ).channels; // bucket still warm
    expect(axiosMock.mock.calls).toHaveLength(2);

    // getChannelAffectedModels refetches realtime despite the warm bucket
    await getChannelAffectedModels(makeChannel(101, { models: ['gpt-4o'] }));
    expect(axiosMock.mock.calls).toHaveLength(3);
  });

  it('filtered & unfiltered global views share one cached bucket', async () => {
    mockRoutes([
      {
        match: (url) => url.startsWith('http://aiproxy.test/api/group_channels/'),
        data: { channels: [makeGroupChannel(201, 'fastgpt:tmb:tmb-a')], total: 1 }
      }
    ]);

    await (
      await listGlobalGroupChannels()
    ).channels;
    expect(axiosMock.mock.calls).toHaveLength(1);

    await (
      await listGlobalGroupChannels()
    ).channels;
    expect(axiosMock.mock.calls).toHaveLength(1); // unfiltered view cached

    // filtered view is served by the same shared bucket — still 1 round trip
    await (
      await listGlobalGroupChannels({ groupId: 'fastgpt:tmb:tmb-a' })
    ).channels;
    expect(axiosMock.mock.calls).toHaveLength(1);

    // and the filter is applied in memory over the cached set
    const filtered = await listGlobalGroupChannels({ groupId: 'fastgpt:tmb:tmb-a' });
    expect(filtered.channels).toEqual([expect.objectContaining({ group_id: 'fastgpt:tmb:tmb-a' })]);
    expect(axiosMock.mock.calls).toHaveLength(1); // still warm
  });
  /* ═══ Quantified gains (review D): latency with simulated RTT, no-cache
   * baseline vs cached, write-invalidation coverage for all 10 writes,
   * failed-write keeps the bucket, concurrent cold misses deduped ═══ */

  it('latency: cold ≈ N×50ms RTT vs warm ≈ 0ms (simulated 50ms round trip)', async () => {
    vi.useFakeTimers();
    try {
      // each aiproxy round trip takes 50ms
      axiosMock.mockImplementation(
        (config) =>
          new Promise((resolve) =>
            setTimeout(() => {
              if (config.url.startsWith('http://aiproxy.test/api/channels/')) {
                resolve(okEnvelope({ channels: SYSTEM_CHANNELS, total: SYSTEM_CHANNELS.length }));
              } else {
                resolve(okEnvelope({ channels: [], total: 0 }));
              }
            }, 50)
          )
      );

      const t0 = Date.now();
      const first = getSystemChannelList();
      await vi.advanceTimersByTimeAsync(50); // 1 round trip for the cold bucket
      await first;
      const coldMs = Date.now() - t0;

      const t1 = Date.now();
      const second = getSystemChannelList(); // cache hit — no timers involved
      await second;
      const warmMs = Date.now() - t1;

      expect(coldMs).toBeGreaterThanOrEqual(50); // 1 × RTT
      expect(warmMs).toBeLessThan(10); // served from the bucket, no network
      expect(axiosMock.mock.calls).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('baseline: 10 reads with no cache = 10 round trips, with cache = 1 (10× gain)', async () => {
    mockDefaultRoutes();

    for (let i = 0; i < 10; i++) {
      resetChannelCache(); // simulate a cache-less deployment per request
      await getSystemChannelList();
    }
    expect(axiosMock.mock.calls).toHaveLength(10); // every request hits aiproxy

    axiosMock.mockClear();
    resetChannelCache(); // drop the bucket the no-cache loop left behind
    for (let i = 0; i < 10; i++) {
      await getSystemChannelList();
    }
    expect(axiosMock.mock.calls).toHaveLength(1); // one bucket fetch serves all 10
  });

  it('every write invalidates: all 10 write ops drop the affected bucket', async () => {
    const groupId = 'fastgpt:tmb:tmb-a';
    const groupUrl = `http://aiproxy.test/api/group/${encodeURIComponent(groupId)}/`;
    const writeCases: Array<{
      name: string;
      bucket: 'system' | 'group';
      run: () => Promise<unknown>;
    }> = [
      {
        name: 'createSystemChannel',
        bucket: 'system',
        run: () => createSystemChannel({ name: 'x', type: 1, key: 'k', models: ['gpt-4o'] })
      },
      {
        name: 'updateSystemChannel',
        bucket: 'system',
        run: () => updateSystemChannel(12, { name: 'x', type: 1, key: 'k', models: ['gpt-4o'] })
      },
      { name: 'deleteSystemChannel', bucket: 'system', run: () => deleteSystemChannel(12) },
      {
        name: 'updateSystemChannelStatus',
        bucket: 'system',
        run: () => updateSystemChannelStatus(12, 2)
      },
      { name: 'testSystemChannel', bucket: 'system', run: () => testSystemChannel(12, 'gpt-4o') },
      {
        name: 'createGroupChannel',
        bucket: 'group',
        run: () => createGroupChannel(groupId, { name: 'x', type: 1, key: 'k', models: ['gpt-4o'] })
      },
      {
        name: 'updateGroupChannel',
        bucket: 'group',
        run: () =>
          updateGroupChannel(groupId, 12, { name: 'x', type: 1, key: 'k', models: ['gpt-4o'] })
      },
      { name: 'deleteGroupChannel', bucket: 'group', run: () => deleteGroupChannel(groupId, 12) },
      {
        name: 'updateGroupChannelStatus',
        bucket: 'group',
        run: () => updateGroupChannelStatus(groupId, 12, 2)
      },
      {
        name: 'testGroupChannel',
        bucket: 'group',
        run: () => testGroupChannel(groupId, 12, 'gpt-4o')
      }
    ];

    for (const { name, bucket, run } of writeCases) {
      axiosMock.mockClear();
      resetChannelCache();
      mockRoutes([
        {
          match: (url) => url.startsWith('http://aiproxy.test/api/channels/'),
          data: { channels: SYSTEM_CHANNELS, total: SYSTEM_CHANNELS.length }
        },
        {
          match: (url) =>
            url.startsWith(
              `http://aiproxy.test/api/group/${encodeURIComponent(groupId)}/channels/`
            ),
          data: { channels: [], total: 0 }
        },
        { match: () => true, data: null } // any write endpoint succeeds
      ]);

      // warm the bucket of the target scope
      await (bucket === 'system' ? listSystemChannels() : listGroupChannels(groupId));
      const warmed = axiosMock.mock.calls.length;

      await run(); // success → the affected bucket must be dropped

      // reading again must refetch (bucket was invalidated): write + refetch = +2
      await (bucket === 'system' ? listSystemChannels() : listGroupChannels(groupId));
      // `${name}` failed here — the affected bucket was not invalidated by the write
      expect(axiosMock.mock.calls).toHaveLength(warmed + 2);
    }
  });

  it('failed write keeps the bucket warm (no invalidation on failure)', async () => {
    mockRoutes([
      {
        match: (url) => url.startsWith('http://aiproxy.test/api/channels/'),
        data: { channels: SYSTEM_CHANNELS, total: SYSTEM_CHANNELS.length }
      },
      { match: () => true, data: null }
    ]);

    await (
      await listSystemChannels()
    ).channels; // warm
    const warmed = axiosMock.mock.calls.length;

    // write fails at the envelope level — the request helper throws before invalidate
    axiosMock.mockResolvedValueOnce({ data: { success: false, message: 'boom' } });
    await expect(updateSystemChannelStatus(12, 2)).rejects.toThrow('boom');

    await (
      await listSystemChannels()
    ).channels; // still warm — no extra round trip
    expect(axiosMock.mock.calls).toHaveLength(warmed + 1); // only the failed write call
  });

  it('concurrent cold misses share one fetchAll (single-flight dedup)', async () => {
    mockDefaultRoutes();

    const [r1, r2, r3] = await Promise.all([
      listSystemChannels(),
      listSystemChannels(),
      listSystemChannels()
    ]);

    expect(r1.channels).toHaveLength(2);
    expect(r2.channels).toHaveLength(2);
    expect(r3.channels).toHaveLength(2);
    expect(axiosMock.mock.calls).toHaveLength(1); // one paginated fetch for 3 concurrent reads
  });
});
