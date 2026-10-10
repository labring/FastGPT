import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

const mocks = vi.hoisted(() => {
  const group = {
    get: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
    listAll: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn(),
    batchDelete: vi.fn(),
    batchUpdateStatus: vi.fn()
  };
  const system = {
    get: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
    listAll: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn(),
    batchDelete: vi.fn(),
    batchUpdateStatus: vi.fn()
  };
  const getChannelsAffectedModels = vi.fn().mockResolvedValue([]);
  return {
    group,
    system,
    getChannelsAffectedModels,
    groupFactory: vi.fn((_groupId: string) => ({ channels: group }))
  };
});

vi.mock('@fastgpt/service/thirdProvider/aiproxy/client', () => ({
  aiProxyClient: {
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
  deleteChannel
} from '@fastgpt/service/core/ai/model/channel/service';

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

describe('channel service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.group.list.mockResolvedValue({ channels: [], total: 0 });
    mocks.system.list.mockResolvedValue({ channels: [], total: 0 });
  });

  describe('createChannel', () => {
    it('creates channel successfully when the member group has no existing channels', async () => {
      mocks.group.list.mockResolvedValue({ channels: [], total: 0 });
      mocks.group.create.mockResolvedValue({ id: 12 });

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
      ).resolves.toEqual({ id: 12 });

      expect(mocks.group.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'first-channel',
          type: 1,
          key: 'sk-new',
          models: ['model-1']
        })
      );
    });

    it('applies protocol defaults on the server and preserves explicit overrides', async () => {
      mocks.group.create.mockResolvedValue({ id: 12 });
      const channelData = { name: '  normalized  ', type: 1, key: 'sk-new', models: [] };
      await createChannel({ channelType: 'team', tmbId: TMB_ID, channelData });
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
      const [, payload] = mocks.group.update.mock.calls[0];
      expect(payload).not.toHaveProperty('key');
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
    it('updates channel status for team channel', async () => {
      mocks.group.get.mockResolvedValue(makeChannel(1, { status: 1 }));

      await updateChannelStatus({
        id: 1,
        status: 0,
        channelType: 'team',
        tmbId: TMB_ID
      });

      expect(mocks.group.updateStatus).toHaveBeenCalledWith(1, 0);
    });

    it('updates channel status for system channel', async () => {
      mocks.system.get.mockResolvedValue({ ...makeChannel(2), group_id: undefined });

      await updateChannelStatus({
        id: 2,
        status: 1,
        channelType: 'system',
        tmbId: ''
      });

      expect(mocks.system.updateStatus).toHaveBeenCalledWith(2, 1);
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
    it('deletes team channel and returns affected models', async () => {
      const affected = [{ modelId: 'm-1', name: 'M1', model: 'gpt-4o' }];
      mocks.group.get.mockResolvedValue(makeChannel(1));
      mocks.getChannelsAffectedModels.mockResolvedValue(affected);

      const res = await deleteChannel({
        teamId: TEAM_ID,
        id: 1,
        channelType: 'team',
        tmbId: TMB_ID
      });

      expect(mocks.getChannelsAffectedModels).toHaveBeenCalledWith({
        channels: [expect.objectContaining({ id: 1 })],
        channelType: 'team',
        teamId: TEAM_ID,
        tmbId: TMB_ID
      });
      expect(mocks.group.delete).toHaveBeenCalledWith(1);
      expect(res).toEqual({ affectedModels: affected });
    });

    it('deletes system channel and returns affected models', async () => {
      mocks.system.get.mockResolvedValue({ ...makeChannel(2), group_id: undefined });
      mocks.getChannelsAffectedModels.mockResolvedValue([]);

      const res = await deleteChannel({
        teamId: TEAM_ID,
        id: 2,
        channelType: 'system',
        tmbId: ''
      });

      expect(mocks.system.delete).toHaveBeenCalledWith(2);
      expect(res).toEqual({ affectedModels: [] });
    });

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
    it('batch deletes team channels and returns affected models', async () => {
      mocks.group.get.mockImplementation((id: number) => Promise.resolve(makeChannel(id)));
      const affected = [{ modelId: 'm-1', name: 'M1', model: 'gpt-4o' }];
      mocks.getChannelsAffectedModels.mockResolvedValue(affected);

      const res = await batchOperateChannels({
        teamId: TEAM_ID,
        body: { ids: [1, 2], action: 'delete', channelType: 'team' },
        tmbId: TMB_ID
      });

      expect(mocks.getChannelsAffectedModels).toHaveBeenCalledWith({
        channels: [expect.objectContaining({ id: 1 }), expect.objectContaining({ id: 2 })],
        channelType: 'team',
        teamId: TEAM_ID,
        tmbId: TMB_ID
      });
      expect(mocks.group.batchDelete).toHaveBeenCalledWith([1, 2]);
      expect(res).toEqual({ affectedModels: affected });
    });

    it('batch deletes system channels', async () => {
      mocks.system.get.mockImplementation((id: number) =>
        Promise.resolve({ ...makeChannel(id), group_id: undefined })
      );
      mocks.getChannelsAffectedModels.mockResolvedValue([]);

      const res = await batchOperateChannels({
        teamId: TEAM_ID,
        body: { ids: [3, 4], action: 'delete', channelType: 'system' },
        tmbId: ''
      });

      expect(mocks.system.batchDelete).toHaveBeenCalledWith([3, 4]);
      expect(res).toEqual({ affectedModels: [] });
    });

    it('batch updates status for team channels', async () => {
      mocks.group.get.mockImplementation((id: number) => Promise.resolve(makeChannel(id)));

      const res = await batchOperateChannels({
        teamId: TEAM_ID,
        body: { ids: [1, 2], action: 'status', status: 0, channelType: 'team' },
        tmbId: TMB_ID
      });

      expect(mocks.group.batchUpdateStatus).toHaveBeenCalledWith([1, 2], 0);
      expect(mocks.getChannelsAffectedModels).not.toHaveBeenCalled();
      expect(res).toEqual({});
    });

    it('batch updates status for system channels', async () => {
      mocks.system.get.mockImplementation((id: number) =>
        Promise.resolve({ ...makeChannel(id), group_id: undefined })
      );

      const res = await batchOperateChannels({
        teamId: TEAM_ID,
        body: { ids: [3, 4], action: 'status', status: 1, channelType: 'system' },
        tmbId: ''
      });

      expect(mocks.system.batchUpdateStatus).toHaveBeenCalledWith([3, 4], 1);
      expect(mocks.getChannelsAffectedModels).not.toHaveBeenCalled();
      expect(res).toEqual({});
    });

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
