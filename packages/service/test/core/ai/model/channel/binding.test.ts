import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LeaseCache,
  RedisLeaseAcquireError,
  RedisLeaseWaitTimeoutError
} from '@fastgpt/dal/redis/caches/lease';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { isServerConfigError } from '@fastgpt/global/common/error/utils';
import type { AiproxyGroupChannel } from '@fastgpt/service/thirdProvider/aiproxy/type';

const mocks = vi.hoisted(() => {
  const createClient = () => ({
    get: vi.fn(),
    list: vi.fn(),
    listAll: vi.fn(),
    update: vi.fn()
  });
  return {
    group: createClient(),
    system: createClient()
  };
});

vi.mock('@fastgpt/service/thirdProvider/aiproxy/client', () => ({
  aiProxyClient: {
    system: { channels: mocks.system },
    group: () => ({ channels: mocks.group })
  }
}));

import {
  removeModelsFromChannels,
  syncModelNameInChannels,
  updateModelChannelBindings
} from '@fastgpt/service/core/ai/model/channel/binding';
import { withChannelWriteLock } from '@fastgpt/service/core/ai/model/channel/lock';
import { updateChannel } from '@fastgpt/service/core/ai/model/channel/service';

const TMB_ID = '60000000000000000000000a';

describe('channel binding write serialization', () => {
  let channels: Map<number, AiproxyGroupChannel>;

  const setChannel = (id: number, overrides: Partial<AiproxyGroupChannel> = {}) => {
    const channel: AiproxyGroupChannel = {
      id,
      name: `channel-${id}`,
      type: 1,
      status: 1,
      models: [],
      group_id: `fastgpt:tmb:${TMB_ID}`,
      ...overrides
    };
    channels.set(id, channel);
    return channel;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    channels = new Map();
    mocks.group.list.mockImplementation(async () => ({
      channels: Array.from(channels.values()),
      total: channels.size
    }));
    mocks.group.listAll.mockImplementation(async () =>
      Array.from(channels.values()).map((channel) => ({ ...channel }))
    );
    mocks.group.get.mockImplementation(async (id: number) => {
      const channel = channels.get(id);
      if (!channel) throw { response: { status: 404 } };
      return {
        ...channel,
        models: [...channel.models],
        ...(channel.model_mapping !== undefined && {
          model_mapping: { ...channel.model_mapping }
        }),
        ...(channel.configs !== undefined && { configs: { ...channel.configs } })
      };
    });
    mocks.group.update.mockImplementation(
      async (id: number, patch: Partial<AiproxyGroupChannel>) => {
        const channel = channels.get(id);
        if (!channel) throw { response: { status: 404 } };
        Object.assign(channel, patch);
      }
    );
  });

  it('serializes concurrent manual binding and channel config updates on the same channel', async () => {
    setChannel(1, { models: ['base-model'], configs: { custom: 'kept' } });
    const editStarted = Promise.withResolvers<void>();
    const completeEdit = Promise.withResolvers<void>();

    mocks.group.update.mockImplementationOnce(async (id, patch) => {
      editStarted.resolve();
      await completeEdit.promise;
      Object.assign(channels.get(id)!, patch);
    });

    const editPromise = updateChannel({
      id: 1,
      channelType: 'team',
      tmbId: TMB_ID,
      channelData: { configs: { chat_upstream_protocol: 'responses' } }
    });
    await Promise.race([editStarted.promise, editPromise]);

    const bindPromise = updateModelChannelBindings({
      model: 'added-model',
      addChannelIds: [1],
      channelType: 'team',
      tmbId: TMB_ID
    });
    await Promise.resolve();
    expect(mocks.group.update).toHaveBeenCalledTimes(1);

    completeEdit.resolve();
    await Promise.all([editPromise, bindPromise]);

    expect(channels.get(1)).toMatchObject({
      models: ['base-model', 'added-model'],
      configs: { custom: 'kept', chat_upstream_protocol: 'responses' }
    });
  });

  it('preserves concurrently added models when rolling back a partial rename failure', async () => {
    setChannel(1, {
      models: ['old-model', 'keep-model'],
      model_mapping: { 'old-model': 'upstream/old' }
    });
    setChannel(2, { models: ['old-model'] });

    mocks.group.update.mockImplementation(async (id, patch) => {
      if (id === 2) {
        // 模拟渠道 1 改名后、回滚前，有另一并发写入向渠道 1 追加了新模型。
        channels.get(1)!.models.push('concurrent-model');
        throw new Error('channel 2 update failed');
      }
      Object.assign(channels.get(id)!, patch);
    });

    await expect(
      syncModelNameInChannels({
        oldModel: 'old-model',
        newModel: 'new-model',
        channelType: 'team',
        tmbId: TMB_ID
      })
    ).rejects.toThrow('channel 2 update failed');

    expect(channels.get(1)?.models).toEqual(['old-model', 'keep-model', 'concurrent-model']);
    expect(channels.get(1)?.model_mapping).toEqual({ 'old-model': 'upstream/old' });
  });

  it('removes deleted models against the latest channel state without clobbering concurrent additions', async () => {
    setChannel(1, {
      models: ['delete-me', 'stay-model'],
      model_mapping: { 'delete-me': 'upstream/del', 'stay-model': 'upstream/stay' }
    });

    const addStarted = Promise.withResolvers<void>();
    const completeAdd = Promise.withResolvers<void>();
    mocks.group.update.mockImplementationOnce(async (id, patch) => {
      addStarted.resolve();
      await completeAdd.promise;
      Object.assign(channels.get(id)!, patch);
    });

    const addPromise = updateModelChannelBindings({
      model: 'fresh-model',
      addChannelIds: [1],
      channelType: 'team',
      tmbId: TMB_ID
    });
    await Promise.race([addStarted.promise, addPromise]);

    const removePromise = removeModelsFromChannels({
      models: ['delete-me'],
      channelType: 'team',
      tmbId: TMB_ID
    });

    completeAdd.resolve();
    await Promise.all([addPromise, removePromise]);

    expect(channels.get(1)?.models).toEqual(['stay-model', 'fresh-model']);
    expect(channels.get(1)?.model_mapping).toEqual({ 'stay-model': 'upstream/stay' });
  });

  it('normalizes wait timeout to 409 UserError and Redis acquire error to 500 ServerConfigError without leaking keys', async () => {
    const timeoutSpy = vi.spyOn(LeaseCache.prototype, 'withConcurrency').mockRejectedValueOnce(
      new RedisLeaseWaitTimeoutError({
        key: `model-channel-write:team:${TMB_ID}:1`,
        label: 'test'
      })
    );
    try {
      const timeoutError = await withChannelWriteLock({
        channelId: 1,
        channelType: 'team',
        tmbId: TMB_ID,
        fn: async () => undefined
      }).catch((error) => error);
      expect(timeoutError).toMatchObject({
        name: 'UserError',
        message: ModelErrEnum.channelWriteBusy
      });
      expect(isServerConfigError(timeoutError)).toBe(false);
    } finally {
      timeoutSpy.mockRestore();
    }

    const acquireSpy = vi.spyOn(LeaseCache.prototype, 'withConcurrency').mockRejectedValueOnce(
      new RedisLeaseAcquireError({
        key: `model-channel-write:team:${TMB_ID}:1`,
        label: 'test',
        cause: new Error('redis down')
      })
    );
    try {
      const acquireError = await withChannelWriteLock({
        channelId: 1,
        channelType: 'team',
        tmbId: TMB_ID,
        fn: async () => undefined
      }).catch((error) => error);
      expect(acquireError).toMatchObject({
        name: 'ServerConfigError',
        message: ModelErrEnum.channelWriteBusy
      });
      expect(isServerConfigError(acquireError)).toBe(true);
    } finally {
      acquireSpy.mockRestore();
    }
  });
});
