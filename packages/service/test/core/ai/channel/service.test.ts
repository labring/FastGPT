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
  const getChannelAffectedModels = vi.fn().mockResolvedValue([]);
  const getBatchChannelsAffectedModels = vi.fn().mockResolvedValue([]);
  return {
    group,
    system,
    getChannelAffectedModels,
    getBatchChannelsAffectedModels,
    groupFactory: vi.fn((_groupId: string) => ({ channels: group }))
  };
});

vi.mock('@fastgpt/service/thirdProvider/aiproxy/client', () => ({
  aiProxyClient: {
    system: { channels: mocks.system },
    group: mocks.groupFactory
  }
}));

vi.mock('@fastgpt/service/core/ai/channel/association', () => ({
  getChannelAffectedModels: mocks.getChannelAffectedModels,
  getBatchChannelsAffectedModels: mocks.getBatchChannelsAffectedModels
}));

import {
  appendModelToChannels,
  batchOperateChannels,
  createChannel,
  deleteChannel,
  removeModelsFromChannels,
  syncModelNameInChannels,
  updateChannel,
  updateChannelStatus,
  updateModelChannelBindings
} from '@fastgpt/service/core/ai/channel/service';

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

describe('channel model binding service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.group.list.mockResolvedValue({ channels: [], total: 0 });
    mocks.system.list.mockResolvedValue({ channels: [], total: 0 });
  });

  describe('updateModelChannelBindings', () => {
    it('appends the model and sends only models and model_mapping patch', async () => {
      mocks.group.get.mockResolvedValue(
        makeChannel(1, {
          models: ['other'],
          model_mapping: { other: 'up-other' },
          sets: ['default']
        })
      );

      await updateModelChannelBindings({
        model: ' model-a ',
        addChannelIds: [1],
        channelType: 'team',
        tmbId: TMB_ID
      });

      expect(mocks.groupFactory).toHaveBeenCalledWith(GROUP_ID);
      expect(mocks.group.update).toHaveBeenCalledWith(1, {
        models: ['other', 'model-a'],
        model_mapping: { other: 'up-other' }
      });
    });

    it('is idempotent when the model is already bound or not bound', async () => {
      mocks.group.get.mockImplementation((id: number) =>
        Promise.resolve(makeChannel(id, { models: id === 1 ? ['model-a'] : ['other'] }))
      );

      await updateModelChannelBindings({
        model: 'model-a',
        addChannelIds: [1],
        removeChannelIds: [2],
        channelType: 'team',
        tmbId: TMB_ID
      });

      expect(mocks.group.update).not.toHaveBeenCalled();
    });

    it('removes the model and its mapping entry while keeping other models', async () => {
      mocks.group.get.mockResolvedValue(
        makeChannel(3, {
          models: ['model-a', 'model-b'],
          model_mapping: { 'model-a': 'up-a', 'model-b': 'up-b' }
        })
      );

      await updateModelChannelBindings({
        model: 'model-a',
        removeChannelIds: [3],
        channelType: 'team',
        tmbId: TMB_ID
      });

      expect(mocks.group.update).toHaveBeenCalledWith(3, {
        models: ['model-b'],
        model_mapping: { 'model-b': 'up-b' }
      });
    });

    it('drops an emptied model_mapping instead of sending an empty object', async () => {
      mocks.group.get.mockResolvedValue(
        makeChannel(4, { models: ['model-a'], model_mapping: { 'model-a': 'up-a' } })
      );

      await updateModelChannelBindings({
        model: 'model-a',
        removeChannelIds: [4],
        channelType: 'team',
        tmbId: TMB_ID
      });

      const [, payload] = mocks.group.update.mock.calls[0];
      expect(payload.models).toEqual([]);
      expect(payload.model_mapping).toBeUndefined();
    });

    it('routes system scope to system channels and never to a member group', async () => {
      mocks.system.get.mockResolvedValue({ ...makeChannel(5), group_id: undefined });

      await updateModelChannelBindings({
        model: 'model-a',
        addChannelIds: [5],
        channelType: 'system',
        tmbId: TMB_ID
      });

      expect(mocks.groupFactory).not.toHaveBeenCalled();
      expect(mocks.system.update).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ models: ['model-a'] })
      );
    });

    it('rejects a channel that is not in the caller bucket and writes nothing', async () => {
      mocks.group.get.mockImplementation(notFound);

      await expect(
        updateModelChannelBindings({
          model: 'model-a',
          addChannelIds: [99],
          channelType: 'team',
          tmbId: TMB_ID
        })
      ).rejects.toBe(ModelErrEnum.channelNotExist);
      expect(mocks.group.update).not.toHaveBeenCalled();
    });

    it('rejects a blank model name before touching AI Proxy', async () => {
      await expect(
        updateModelChannelBindings({
          model: '   ',
          addChannelIds: [1],
          channelType: 'team',
          tmbId: TMB_ID
        })
      ).rejects.toBe(ModelErrEnum.invalidModelConfig);
      expect(mocks.group.get).not.toHaveBeenCalled();
    });
  });

  describe('removeModelsFromChannels', () => {
    it('cleans only channels that reference the deleted models', async () => {
      mocks.group.listAll.mockResolvedValue([
        makeChannel(1, { models: ['m1', 'm2'], model_mapping: { m1: 'u1', m2: 'u2' } }),
        makeChannel(2, { models: ['m2'] }),
        makeChannel(3, { models: ['m1'] })
      ]);

      await removeModelsFromChannels({ models: ['m1'], channelType: 'team', tmbId: TMB_ID });

      expect(mocks.group.update).toHaveBeenCalledTimes(2);
      expect(mocks.group.update).toHaveBeenCalledWith(1, {
        models: ['m2'],
        model_mapping: { m2: 'u2' }
      });
      expect(mocks.group.update).toHaveBeenCalledWith(3, {
        models: []
      });
    });

    it('also cleans a stale model_mapping entry that is no longer in models', async () => {
      mocks.group.listAll.mockResolvedValue([
        makeChannel(1, { models: ['m2'], model_mapping: { m1: 'u1', m2: 'u2' } })
      ]);

      await removeModelsFromChannels({ models: ['m1'], channelType: 'team', tmbId: TMB_ID });

      expect(mocks.group.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ models: ['m2'], model_mapping: { m2: 'u2' } })
      );
    });

    it('treats a missing AI Proxy bucket as nothing to clean', async () => {
      mocks.group.listAll.mockImplementation(notFound);

      await expect(
        removeModelsFromChannels({ models: ['m1'], channelType: 'team', tmbId: TMB_ID })
      ).resolves.toBeUndefined();
      expect(mocks.group.update).not.toHaveBeenCalled();
    });

    it('propagates real AI Proxy failures so the caller can log them', async () => {
      mocks.group.listAll.mockRejectedValue(new Error('aiproxy down'));

      await expect(
        removeModelsFromChannels({ models: ['m1'], channelType: 'team', tmbId: TMB_ID })
      ).rejects.toThrow('aiproxy down');
    });

    it('skips AI Proxy entirely when there is no model name to clean', async () => {
      await removeModelsFromChannels({ models: ['', '  '], channelType: 'team', tmbId: TMB_ID });

      expect(mocks.group.listAll).not.toHaveBeenCalled();
    });
  });

  describe('syncModelNameInChannels', () => {
    it('renames a team model in channel models and model mappings', async () => {
      mocks.group.listAll.mockResolvedValue([
        makeChannel(1, {
          models: ['old-model', 'keep-model'],
          model_mapping: { 'old-model': 'upstream-model', 'keep-model': 'upstream-keep' }
        }),
        makeChannel(2, { models: ['keep-model'] })
      ]);

      await syncModelNameInChannels({
        oldModel: 'old-model',
        newModel: 'new-model',
        channelType: 'team',
        tmbId: TMB_ID
      });

      expect(mocks.groupFactory).toHaveBeenCalledWith(GROUP_ID);
      expect(mocks.group.update).toHaveBeenCalledOnce();
      expect(mocks.group.update).toHaveBeenCalledWith(1, {
        models: ['new-model', 'keep-model'],
        model_mapping: { 'keep-model': 'upstream-keep', 'new-model': 'upstream-model' }
      });
    });

    it('uses system channels for system models', async () => {
      mocks.system.listAll.mockResolvedValue([
        { ...makeChannel(3, { models: ['old-model'] }), group_id: undefined }
      ]);

      await syncModelNameInChannels({
        oldModel: 'old-model',
        newModel: 'new-model',
        channelType: 'system',
        tmbId: ''
      });

      expect(mocks.groupFactory).not.toHaveBeenCalled();
      expect(mocks.system.update).toHaveBeenCalledWith(3, { models: ['new-model'] });
    });

    it('rolls back channels already updated when a later rename fails', async () => {
      mocks.group.listAll.mockResolvedValue([
        makeChannel(1, { models: ['old-model'] }),
        makeChannel(2, { models: ['old-model'] })
      ]);
      mocks.group.update
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('second channel failed'))
        .mockResolvedValueOnce(undefined);

      await expect(
        syncModelNameInChannels({
          oldModel: 'old-model',
          newModel: 'new-model',
          channelType: 'team',
          tmbId: TMB_ID
        })
      ).rejects.toThrow('second channel failed');

      expect(mocks.group.update).toHaveBeenNthCalledWith(1, 1, { models: ['new-model'] });
      expect(mocks.group.update).toHaveBeenNthCalledWith(2, 2, { models: ['new-model'] });
      expect(mocks.group.update).toHaveBeenNthCalledWith(3, 1, { models: ['old-model'] });
    });
  });

  describe('appendModelToChannels', () => {
    it('swallows binding failures because the model itself is already created', async () => {
      mocks.group.get.mockImplementation(notFound);

      await expect(
        appendModelToChannels({
          channelIds: [1],
          model: 'model-a',
          channelType: 'team',
          tmbId: TMB_ID
        })
      ).resolves.toBeUndefined();
      expect(mocks.group.update).not.toHaveBeenCalled();
    });

    it('does nothing when no channel is selected', async () => {
      await appendModelToChannels({
        channelIds: [],
        model: 'model-a',
        channelType: 'team',
        tmbId: TMB_ID
      });

      expect(mocks.group.get).not.toHaveBeenCalled();
    });
  });

  describe('createChannel', () => {
    it('creates channel successfully when the member group has no existing channels', async () => {
      mocks.group.list.mockResolvedValue({ channels: [], total: 0 });
      mocks.group.create.mockResolvedValue(undefined);

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
      ).resolves.toBeUndefined();

      expect(mocks.group.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'first-channel',
          type: 1,
          key: 'sk-new',
          models: ['model-1']
        })
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
          status: 0,
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
      mocks.getChannelAffectedModels.mockResolvedValue(affected);

      const res = await deleteChannel({
        id: 1,
        channelType: 'team',
        tmbId: TMB_ID
      });

      expect(mocks.getChannelAffectedModels).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 })
      );
      expect(mocks.group.delete).toHaveBeenCalledWith(1);
      expect(res).toEqual({ affectedModels: affected });
    });

    it('deletes system channel and returns affected models', async () => {
      mocks.system.get.mockResolvedValue({ ...makeChannel(2), group_id: undefined });
      mocks.getChannelAffectedModels.mockResolvedValue([]);

      const res = await deleteChannel({
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
      mocks.getBatchChannelsAffectedModels.mockResolvedValue(affected);

      const res = await batchOperateChannels({
        body: { ids: [1, 2], action: 'delete', channelType: 'team' },
        tmbId: TMB_ID
      });

      expect(mocks.getBatchChannelsAffectedModels).toHaveBeenCalled();
      expect(mocks.group.batchDelete).toHaveBeenCalledWith([1, 2]);
      expect(res).toEqual({ affectedModels: affected });
    });

    it('batch deletes system channels', async () => {
      mocks.system.get.mockImplementation((id: number) =>
        Promise.resolve({ ...makeChannel(id), group_id: undefined })
      );
      mocks.getBatchChannelsAffectedModels.mockResolvedValue([]);

      const res = await batchOperateChannels({
        body: { ids: [3, 4], action: 'delete', channelType: 'system' },
        tmbId: ''
      });

      expect(mocks.system.batchDelete).toHaveBeenCalledWith([3, 4]);
      expect(res).toEqual({ affectedModels: [] });
    });

    it('batch updates status for team channels', async () => {
      mocks.group.get.mockImplementation((id: number) => Promise.resolve(makeChannel(id)));

      const res = await batchOperateChannels({
        body: { ids: [1, 2], action: 'status', status: 0, channelType: 'team' },
        tmbId: TMB_ID
      });

      expect(mocks.group.batchUpdateStatus).toHaveBeenCalledWith([1, 2], 0);
      expect(res).toEqual({});
    });

    it('batch updates status for system channels', async () => {
      mocks.system.get.mockImplementation((id: number) =>
        Promise.resolve({ ...makeChannel(id), group_id: undefined })
      );

      const res = await batchOperateChannels({
        body: { ids: [3, 4], action: 'status', status: 1, channelType: 'system' },
        tmbId: ''
      });

      expect(mocks.system.batchUpdateStatus).toHaveBeenCalledWith([3, 4], 1);
      expect(res).toEqual({});
    });

    it('rejects if any channel does not exist in batch operation', async () => {
      mocks.group.get.mockImplementation((id: number) =>
        id === 1 ? Promise.resolve(makeChannel(1)) : notFound()
      );

      await expect(
        batchOperateChannels({
          body: { ids: [1, 2], action: 'delete', channelType: 'team' },
          tmbId: TMB_ID
        })
      ).rejects.toBe(ModelErrEnum.channelNotExist);

      expect(mocks.group.batchDelete).not.toHaveBeenCalled();
    });
  });
});
