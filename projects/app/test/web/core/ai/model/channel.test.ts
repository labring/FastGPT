import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getChannelList, getChannelPageList } from '@/web/core/ai/model/channel';
import { PaginationPageSizeLimit } from '@fastgpt/global/openapi/api';
import type { ChannelListItem } from '@fastgpt/global/openapi/core/ai/model/channel/api';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/web/common/api/request', () => ({
  GET: get,
  POST: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn()
}));

describe('channel list requests', () => {
  beforeEach(() => get.mockReset());

  it('loads every channel for filters even when the API defaults to a single page', async () => {
    const channels: ChannelListItem[] = Array.from(
      { length: PaginationPageSizeLimit + 1 },
      (_, index) => ({
        id: index + 1,
        created_at: index,
        name: `channel-${index}`,
        type: 1,
        status: 1,
        models: [],
        relatedModelCount: 0
      })
    );
    get.mockImplementation(async (_path, { pageNum = 1, pageSize = 20 } = {}) => ({
      list: channels.slice((pageNum - 1) * pageSize, pageNum * pageSize),
      total: channels.length
    }));

    const result = await getChannelList({ channelType: 'team', search: 'matching' });

    expect(result).toHaveLength(channels.length);
    expect(result.map(({ id }) => id)).toEqual(channels.map(({ id }) => id).reverse());
    expect(
      get.mock.calls
        .filter(([path]) => path === '/core/ai/model/channel/list')
        .map(([, params]) => params)
    ).toEqual([
      { channelType: 'team', search: 'matching', pageNum: 1, pageSize: PaginationPageSizeLimit },
      { channelType: 'team', search: 'matching', pageNum: 2, pageSize: PaginationPageSizeLimit }
    ]);
  });

  it('stops when a page becomes empty and leaves explicit page requests paginated', async () => {
    const empty = { list: [], total: 5 };
    get.mockResolvedValue(empty);
    expect(await getChannelList({ channelType: 'system' })).toEqual([]);
    expect(get).toHaveBeenCalledTimes(1);

    const params = { channelType: 'system' as const, pageNum: 3, pageSize: 2 };
    expect(await getChannelPageList(params)).toBe(empty);
    expect(get).toHaveBeenLastCalledWith('/core/ai/model/channel/list', params);
  });
});
