import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

const mocks = vi.hoisted(() => {
  const createClient = () => ({
    get: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn(),
    batchDelete: vi.fn(),
    batchUpdateStatus: vi.fn()
  });
  const group = createClient();
  const system = createClient();
  const getChannelsAffectedModels = vi.fn().mockResolvedValue([]);
  return {
    getTypeMetas: vi.fn(),
    group,
    system,
    getChannelsAffectedModels,
    groupFactory: vi.fn((_groupId: string) => ({ channels: group }))
  };
});

vi.mock('@fastgpt/service/thirdProvider/aiproxy/client', () => ({
  aiProxyClient: {
    getTypeMetas: mocks.getTypeMetas,
    system: { channels: mocks.system },
    group: mocks.groupFactory
  }
}));

vi.mock('@fastgpt/service/core/ai/model/channel/association', () => ({
  getChannelsAffectedModels: mocks.getChannelsAffectedModels
}));

import {
  createChannel,
  updateChannel,
  updateChannelStatus,
  batchOperateChannels,
  deleteChannel,
  getChannelTypeMetas
} from '@fastgpt/service/core/ai/model/channel/service';
import { resetChannelCache } from '@fastgpt/service/core/ai/model/channel/cache';

const TEAM_ID = '60000000000000000000000b';
const TMB_ID = '60000000000000000000000a';
const GROUP_ID = `fastgpt:tmb:${TMB_ID}`;

const makeChannel = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `ch-${id}`,
  type: 1,
  key: `sk-${id}`,
  status: 1,
  priority: 5,
  models: [] as string[],
  group_id: GROUP_ID,
  ...overrides
});

const notFound = () => Promise.reject({ response: { status: 404 } });

describe('getChannelTypeMetas', () => {
  beforeEach(() => {
    resetChannelCache();
    mocks.getTypeMetas.mockReset();
    global.aiproxyChannelsCache = [];
  });

  it('merges display metadata and restricts creation to the intersection without leaking upstream extras', async () => {
    const name = { en: 'Custom', 'zh-CN': '自定义', 'zh-Hant': '自訂' };
    const displayChannels = [
      { channelId: 1, name, avatar: 'custom.svg', website: 'https://custom.example.com' },
      { channelId: 2, name, avatar: 'legacy.svg' },
      { channelId: 4, name, avatar: 'bad-website.svg', website: 123 }
    ];
    global.aiproxyChannelsCache = displayChannels;
    const upstream = {
      1: {
        name: 'Upstream',
        defaultBaseUrl: 'https://api.example.com',
        keyHelp: 'sk-*',
        key: 'secret'
      },
      3: { name: 'Unknown', defaultBaseUrl: '', keyHelp: '' }
    };
    mocks.getTypeMetas.mockResolvedValue(upstream);

    expect(await getChannelTypeMetas()).toEqual({
      1: {
        name: 'Upstream',
        defaultBaseUrl: 'https://api.example.com',
        keyHelp: 'sk-*',
        displayName: name,
        avatar: 'custom.svg',
        order: 0,
        website: 'https://custom.example.com',
        canCreate: true
      },
      2: {
        name: 'Custom',
        defaultBaseUrl: '',
        keyHelp: '',
        displayName: name,
        avatar: 'legacy.svg',
        order: 1,
        website: undefined,
        canCreate: false
      },
      3: { name: 'Unknown', defaultBaseUrl: '', keyHelp: '', canCreate: false },
      4: {
        name: 'Custom',
        defaultBaseUrl: '',
        keyHelp: '',
        displayName: name,
        avatar: 'bad-website.svg',
        order: 2,
        website: undefined,
        canCreate: false
      }
    });
    expect(upstream[1].key).toBe('secret');

    // 上游缓存命中时，Plugin 的展示更新仍须立即生效。
    global.aiproxyChannelsCache[0].avatar = 'updated.svg';
    global.aiproxyChannelsCache.reverse();
    expect((await getChannelTypeMetas())[1]).toMatchObject({ avatar: 'updated.svg', order: 2 });
    expect(mocks.getTypeMetas).toHaveBeenCalledTimes(1);
  });

  it('supports empty and uninitialized display caches', async () => {
    mocks.getTypeMetas.mockResolvedValue({});
    expect(await getChannelTypeMetas()).toEqual({});
    vi.stubGlobal('aiproxyChannelsCache', undefined);
    try {
      expect(await getChannelTypeMetas()).toEqual({});
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('propagates upstream errors and allows a subsequent retry', async () => {
    const error = new Error('AI Proxy unavailable');
    mocks.getTypeMetas.mockRejectedValueOnce(error).mockResolvedValueOnce({});
    await expect(getChannelTypeMetas()).rejects.toBe(error);
    await expect(getChannelTypeMetas()).resolves.toEqual({});
  });
});

describe('channel service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.group.list.mockResolvedValue({ channels: [], total: 0 });
    mocks.system.list.mockResolvedValue({ channels: [], total: 0 });
  });

  describe('createChannel', () => {
    it('applies protocol defaults on the server and preserves explicit overrides', async () => {
      mocks.group.create.mockResolvedValue({ id: 12 });
      const channelData = { name: '  normalized  ', type: 1, key: 'sk-new', models: [] };
      await expect(
        createChannel({ channelType: 'team', tmbId: TMB_ID, channelData })
      ).resolves.toEqual({ id: 12 });
      expect(mocks.group.create).toHaveBeenLastCalledWith({
        ...channelData,
        name: 'normalized',
        configs: { map_reasoning_to_reasoning_content: true }
      });
      await createChannel({
        channelType: 'team',
        tmbId: TMB_ID,
        channelData: {
          ...channelData,
          configs: { map_reasoning_to_reasoning_content: false, custom: 1 }
        }
      });
      expect(mocks.group.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          configs: { map_reasoning_to_reasoning_content: false, custom: 1 }
        })
      );
      await createChannel({
        channelType: 'system',
        tmbId: TMB_ID,
        channelData: { ...channelData, type: 14, configs: { custom: 2 } }
      });
      expect(mocks.system.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ configs: { custom: 2 } })
      );
    });

    it('rejects creation if a channel with the same name already exists', async () => {
      mocks.group.list.mockResolvedValue({
        channels: [makeChannel(1, { name: 'first-channel' })],
        total: 1
      });

      await expect(
        createChannel({
          channelType: 'team',
          tmbId: TMB_ID,
          channelData: {
            name: 'first-channel',
            type: 1,
            key: 'sk-new',
            models: ['model-1']
          }
        })
      ).rejects.toBe(ModelErrEnum.channelNameConflict);

      expect(mocks.group.create).not.toHaveBeenCalled();
    });

    it('maps storage-level duplicate error to channelNameConflict on concurrent creation', async () => {
      mocks.group.list.mockResolvedValue({ channels: [], total: 0 });
      mocks.group.create.mockRejectedValue(new Error('channel name duplicated'));

      await expect(
        createChannel({
          channelType: 'team',
          tmbId: TMB_ID,
          channelData: {
            name: 'concurrent-channel',
            type: 1,
            key: 'sk-new',
            models: ['model-1']
          }
        })
      ).rejects.toBe(ModelErrEnum.channelNameConflict);
    });
  });

  describe('updateChannel', () => {
    it('forwards only explicitly provided fields and preserves key when key is omitted', async () => {
      mocks.group.get.mockResolvedValue(makeChannel(1, { name: 'ch-1', key: 'sk-1' }));
      mocks.group.list.mockResolvedValue({
        channels: [makeChannel(1, { name: 'ch-1' })],
        total: 1
      });

      await updateChannel({
        id: 1,
        channelType: 'team',
        tmbId: TMB_ID,
        channelData: {
          name: 'renamed-channel',
          type: 1,
          models: ['m1']
        }
      });

      expect(mocks.group.update).toHaveBeenCalledWith(1, {
        name: 'renamed-channel',
        type: 1,
        models: ['m1']
      });
    });

    it('updates key when new key is explicitly provided', async () => {
      mocks.group.get.mockResolvedValue(makeChannel(1));
      mocks.group.list.mockResolvedValue({
        channels: [makeChannel(1)],
        total: 1
      });

      await updateChannel({
        id: 1,
        channelType: 'team',
        tmbId: TMB_ID,
        channelData: { key: 'new-sk' }
      });

      expect(mocks.group.update).toHaveBeenCalledWith(1, { key: 'new-sk' });
    });

    it('rejects update if renamed channel conflicts with an existing channel name', async () => {
      mocks.group.get.mockResolvedValue(makeChannel(1, { name: 'old-name' }));
      mocks.group.list.mockResolvedValue({
        channels: [makeChannel(1, { name: 'old-name' }), makeChannel(2, { name: 'conflict-name' })],
        total: 2
      });

      await expect(
        updateChannel({
          id: 1,
          channelType: 'team',
          tmbId: TMB_ID,
          channelData: { name: 'conflict-name' }
        })
      ).rejects.toBe(ModelErrEnum.channelNameConflict);

      expect(mocks.group.update).not.toHaveBeenCalled();
    });

    it('allows keeping the same name without triggering conflict', async () => {
      mocks.group.get.mockResolvedValue(makeChannel(1, { name: 'same-name' }));
      mocks.group.list.mockResolvedValue({
        channels: [makeChannel(1, { name: 'same-name' })],
        total: 1
      });

      await expect(
        updateChannel({
          id: 1,
          channelType: 'team',
          tmbId: TMB_ID,
          channelData: { name: 'same-name', type: 1 }
        })
      ).resolves.toBeUndefined();

      expect(mocks.group.update).toHaveBeenCalledWith(1, {
        name: 'same-name',
        type: 1
      });
    });

    it('maps storage-level duplicate error to channelNameConflict on concurrent rename', async () => {
      mocks.group.get.mockResolvedValue(makeChannel(1, { name: 'old-name' }));
      mocks.group.list.mockResolvedValue({
        channels: [makeChannel(1, { name: 'old-name' })],
        total: 1
      });
      mocks.group.update.mockRejectedValue(new Error('channel name duplicated'));

      await expect(
        updateChannel({
          id: 1,
          channelType: 'team',
          tmbId: TMB_ID,
          channelData: { name: 'concurrent-rename' }
        })
      ).rejects.toBe(ModelErrEnum.channelNameConflict);
    });

    it('routes system scope to system channels and rejects non-existent channel', async () => {
      mocks.system.get.mockImplementation(notFound);

      await expect(
        updateChannel({
          id: 99,
          channelType: 'system',
          tmbId: '',
          channelData: { name: 'any' }
        })
      ).rejects.toBe(ModelErrEnum.channelNotExist);

      expect(mocks.groupFactory).not.toHaveBeenCalled();
      expect(mocks.system.update).not.toHaveBeenCalled();
    });
  });

  describe('updateChannelStatus', () => {
    it.each(['team', 'system'] as const)('updates status in %s scope', async (channelType) => {
      const client = channelType === 'team' ? mocks.group : mocks.system;
      client.get.mockResolvedValue(makeChannel(1));
      await updateChannelStatus({ id: 1, status: 2, channelType, tmbId: TMB_ID });
      expect(client.updateStatus).toHaveBeenCalledWith(1, 2);
    });

    it('rejects if channel does not exist', async () => {
      mocks.group.get.mockImplementation(notFound);

      await expect(
        updateChannelStatus({
          id: 99,
          status: 2,
          channelType: 'team',
          tmbId: TMB_ID
        })
      ).rejects.toBe(ModelErrEnum.channelNotExist);

      expect(mocks.group.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('deleteChannel', () => {
    it.each(['team', 'system'] as const)(
      'deletes channels in %s scope with affected models',
      async (channelType) => {
        const client = channelType === 'team' ? mocks.group : mocks.system;
        const affected = [{ modelId: 'm-1', name: 'M1', model: 'gpt-4o' }];
        client.get.mockResolvedValue(makeChannel(1));
        mocks.getChannelsAffectedModels.mockResolvedValue(affected);

        const result = await deleteChannel({ teamId: TEAM_ID, id: 1, channelType, tmbId: TMB_ID });
        expect(mocks.getChannelsAffectedModels).toHaveBeenCalledWith({
          channels: [expect.objectContaining({ id: 1 })],
          channelType,
          teamId: TEAM_ID,
          tmbId: TMB_ID
        });
        expect(client.delete).toHaveBeenCalledWith(1);
        expect(result).toEqual({ affectedModels: affected });
      }
    );

    it('rejects if channel does not exist', async () => {
      mocks.group.get.mockImplementation(notFound);

      await expect(
        deleteChannel({
          teamId: TEAM_ID,
          id: 99,
          channelType: 'team',
          tmbId: TMB_ID
        })
      ).rejects.toBe(ModelErrEnum.channelNotExist);

      expect(mocks.group.delete).not.toHaveBeenCalled();
    });
  });

  describe('batchOperateChannels', () => {
    it.each(['team', 'system'] as const)(
      'batch deletes channels in %s scope',
      async (channelType) => {
        const client = channelType === 'team' ? mocks.group : mocks.system;
        const affected = [{ modelId: 'm-1', name: 'M1', model: 'gpt-4o' }];
        client.get.mockImplementation((id: number) => Promise.resolve(makeChannel(id)));
        mocks.getChannelsAffectedModels.mockResolvedValue(affected);

        const result = await batchOperateChannels({
          teamId: TEAM_ID,
          body: { ids: [1, 2], action: 'delete', channelType },
          tmbId: TMB_ID
        });
        expect(mocks.getChannelsAffectedModels).toHaveBeenCalledWith({
          channels: [expect.objectContaining({ id: 1 }), expect.objectContaining({ id: 2 })],
          channelType,
          teamId: TEAM_ID,
          tmbId: TMB_ID
        });
        expect(client.batchDelete).toHaveBeenCalledWith([1, 2]);
        expect(result).toEqual({ affectedModels: affected });
      }
    );

    it.each(['team', 'system'] as const)(
      'batch updates status in %s scope',
      async (channelType) => {
        const client = channelType === 'team' ? mocks.group : mocks.system;
        client.get.mockImplementation((id: number) => Promise.resolve(makeChannel(id)));
        const result = await batchOperateChannels({
          teamId: TEAM_ID,
          body: { ids: [1, 2], action: 'status', status: 2, channelType },
          tmbId: TMB_ID
        });
        expect(client.batchUpdateStatus).toHaveBeenCalledWith([1, 2], 2);
        expect(mocks.getChannelsAffectedModels).not.toHaveBeenCalled();
        expect(result).toEqual({});
      }
    );

    it('rejects if any channel does not exist in batch operation', async () => {
      mocks.group.get.mockImplementation((id: number) =>
        id === 1 ? Promise.resolve(makeChannel(1)) : notFound()
      );

      await expect(
        batchOperateChannels({
          teamId: TEAM_ID,
          body: { ids: [1, 2], action: 'delete', channelType: 'team' },
          tmbId: TMB_ID
        })
      ).rejects.toBe(ModelErrEnum.channelNotExist);

      expect(mocks.group.batchDelete).not.toHaveBeenCalled();
    });
  });
});
