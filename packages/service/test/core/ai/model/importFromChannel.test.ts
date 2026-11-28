import {
  LeaseCache,
  RedisLeaseAcquireError,
  RedisLeaseWaitTimeoutError
} from '@fastgpt/dal/redis/caches/lease';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import type { CreateModelData } from '@fastgpt/global/openapi/core/ai/model/api';
import { AxiosError } from 'axios';
import type { AiproxyChannel } from '@fastgpt/service/thirdProvider/aiproxy/type';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createModelMock,
  getSystemModelHandleMock,
  resolveChannelMock,
  getModelCatalogMock,
  getTypeMetasMock,
  getModelProvidersMock,
  refreshTemplatesMock,
  updateGroupChannelMock,
  updateChannelMock
} = vi.hoisted(() => ({
  createModelMock: vi.fn(),
  getSystemModelHandleMock: vi.fn(),
  resolveChannelMock: vi.fn(),
  getModelCatalogMock: vi.fn(),
  getTypeMetasMock: vi.fn(),
  getModelProvidersMock: vi.fn(),
  refreshTemplatesMock: vi.fn(),
  updateGroupChannelMock: vi.fn(),
  updateChannelMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
  getSystemModelHandle: getSystemModelHandleMock
}));
vi.mock('@fastgpt/service/core/ai/model/channel/resolve', () => ({
  resolveChannelForOperation: resolveChannelMock,
  resolveChannelsForOperation: ({ ids }: { ids: number[] }) =>
    Promise.all(ids.map((id) => resolveChannelMock({ id })))
}));
vi.mock('@fastgpt/service/core/ai/model/channel/cache', () => ({
  getCachedTypeMetas: (fetch: () => Promise<unknown>) => fetch()
}));
vi.mock('@fastgpt/service/core/ai/model/provider/controller', () => ({
  getModelProviders: getModelProvidersMock
}));
vi.mock('@fastgpt/service/core/ai/model/service', () => ({
  createModel: createModelMock
}));
vi.mock('@fastgpt/service/core/ai/model/template', () => ({
  refreshModelTemplates: refreshTemplatesMock
}));
vi.mock('@fastgpt/service/thirdProvider/aiproxy/client', () => ({
  aiProxyClient: {
    getTypeMetas: getTypeMetasMock,
    group: () => ({ channels: { update: updateGroupChannelMock } }),
    system: { channels: { getModelCatalog: getModelCatalogMock, update: updateChannelMock } }
  }
}));

import { updateModelChannelBindings } from '@fastgpt/service/core/ai/model/channel/binding';
import {
  importFromChannel,
  previewImportFromChannel
} from '@fastgpt/service/core/ai/model/importFromChannel';

const createModelData = (model: string, isActive?: boolean): CreateModelData => ({
  type: ModelTypeEnum.llm,
  provider: 'openai',
  model,
  name: model,
  scope: ModelScopeEnum.system,
  isActive,
  config: { maxContext: 1000, maxResponse: 100, quoteMaxToken: 500 }
});

describe('apply model imports from channel', () => {
  const scope = {
    channelType: 'system' as const,
    teamId: '6000000000000000000000aa',
    tmbId: '60000000000000000000000a'
  };
  let channel: AiproxyChannel;

  beforeEach(() => {
    vi.clearAllMocks();
    channel = {
      id: 1,
      name: 'System channel',
      type: 1,
      status: 1,
      models: [],
      model_mapping: {}
    };
    resolveChannelMock.mockImplementation(async () => ({ ...channel }));
    getSystemModelHandleMock.mockResolvedValue({
      getSystemModels: () => [{ modelId: 'existing-id', model: 'existing-model' }]
    });
    getModelCatalogMock.mockResolvedValue([
      {
        id: 'openai/unknown-model',
        architecture: { output_modalities: ['text', 'embedding'] },
        context_length: 48000,
        top_provider: { max_completion_tokens: 2048 }
      }
    ]);
    getTypeMetasMock.mockResolvedValue({ 1: { name: ' OpenAI ' } });
    getModelProvidersMock.mockReturnValue([{ id: 'openai', name: 'openai' }]);
    refreshTemplatesMock.mockResolvedValue([]);
    const updateChannel = async (_id: number, patch: Partial<AiproxyChannel>) => {
      Object.assign(channel, patch);
    };
    updateChannelMock.mockImplementation(updateChannel);
    updateGroupChannelMock.mockImplementation(updateChannel);
  });

  it('infers a unique cached provider and keeps context length when type is unresolved', async () => {
    const preview = await previewImportFromChannel({
      channelId: 1,
      ...scope
    });

    expect(preview.items[0]).toMatchObject({ contextLength: 48000, maxCompletionTokens: 2048 });
    expect(preview.items[0].candidate).toMatchObject({
      category: 'blank',
      modelData: { provider: 'openai' }
    });
    if (preview.items[0].candidate.category === 'blank') {
      expect(preview.items[0].candidate.modelData).not.toHaveProperty('config');
    }
  });

  it('keeps preview available when optional provider type metadata fails', async () => {
    getTypeMetasMock.mockRejectedValueOnce(new Error('type metadata unavailable'));

    const preview = await previewImportFromChannel({
      channelId: 1,
      ...scope
    });

    expect(preview.items[0].candidate).toMatchObject({
      category: 'blank'
    });
    if (preview.items[0].candidate.category === 'blank') {
      expect(preview.items[0].candidate.modelData).not.toHaveProperty('provider');
    }
  });

  it('maps an unsupported channel catalog to a stable model error', async () => {
    getModelCatalogMock.mockRejectedValueOnce(
      Object.assign(new AxiosError('model catalog is unsupported for this channel type'), {
        response: { status: 501 }
      })
    );

    await expect(
      previewImportFromChannel({
        channelId: 1,
        ...scope
      })
    ).rejects.toMatchObject({
      name: 'UserError',
      message: ModelErrEnum.channelCatalogUnsupported
    });
  });

  it('excludes configured models by exact name and target-channel alias', async () => {
    channel.models = ['existing-model'];
    channel.model_mapping = { 'existing-model': 'vendor/opaque-id' };
    getModelCatalogMock.mockResolvedValueOnce([
      { id: 'vendor/opaque-id' },
      { id: 'existing-model' },
      { id: 'vendor/new-model' }
    ]);

    const preview = await previewImportFromChannel({
      channelId: 1,
      ...scope
    });

    expect(preview.items.map(({ providerModelSlug }) => providerModelSlug)).toEqual([
      'vendor/new-model'
    ]);
  });

  it('keeps a suffix-only local match available to import from a template', async () => {
    channel.models = ['mini'];
    getSystemModelHandleMock.mockResolvedValue({
      getSystemModels: () => [{ modelId: 'existing-id', model: 'mini' }]
    });
    getModelCatalogMock.mockResolvedValueOnce([{ id: 'openai/gpt-4o-mini' }]);
    refreshTemplatesMock.mockResolvedValueOnce([createModelData('gpt-4o-mini')]);

    const preview = await previewImportFromChannel({
      channelId: 1,
      ...scope
    });

    expect(preview.items).toMatchObject([
      {
        providerModelSlug: 'openai/gpt-4o-mini',
        candidate: { category: 'template', template: { model: 'gpt-4o-mini' } }
      }
    ]);
  });

  it('keeps a nonmatching model available when a target alias points elsewhere', async () => {
    channel.models = ['existing-model'];
    channel.model_mapping = { 'existing-model': 'old/provider-id' };
    getModelCatalogMock.mockResolvedValueOnce([{ id: 'vendor/existing-model' }]);

    const preview = await previewImportFromChannel({
      channelId: 1,
      ...scope
    });

    expect(preview.items[0].candidate).toMatchObject({ category: 'blank' });
  });

  it('keeps result order and distinguishes existing bindings from a failed batch update', async () => {
    createModelMock
      .mockRejectedValueOnce(new Error('duplicate'))
      .mockResolvedValueOnce({ modelId: 'created-id' })
      .mockResolvedValueOnce({ modelId: 'successful-id' });
    channel.models = ['upstream/successful'];
    updateChannelMock.mockRejectedValueOnce(new Error('binding failed'));

    const results = await importFromChannel({
      channelId: 1,
      ...scope,
      models: [
        createModelData('upstream/duplicate'),
        createModelData('upstream/created-without-binding'),
        createModelData('upstream/successful')
      ]
    });

    expect(results.results.map(({ model, status }) => ({ model, status }))).toEqual([
      { model: 'upstream/duplicate', status: 'failed' },
      { model: 'upstream/created-without-binding', status: 'failed' },
      { model: 'upstream/successful', status: 'success' }
    ]);
    expect(createModelMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ modelData: expect.objectContaining({ isActive: true }) })
    );
    expect(results.results[0]).toMatchObject({ status: 'failed', error: 'duplicate' });
    expect(results.results[1]).toMatchObject({
      status: 'failed',
      modelId: 'created-id',
      error: 'binding failed'
    });
    expect(results.results[2]).toMatchObject({ status: 'success', modelId: 'successful-id' });
  });

  it.each(['system', 'team'] as const)(
    'adds the upstream model with the %s channel update and honors enabled state',
    async (channelType) => {
      createModelMock
        .mockResolvedValueOnce({ modelId: 'disabled-id' })
        .mockResolvedValueOnce({ modelId: 'enabled-id' });
      channel.models = ['existing-model'];
      channel.model_mapping = { 'existing-model': 'vendor/existing-model' };

      const results = await importFromChannel({
        channelId: 1,
        ...scope,
        channelType,
        models: [
          createModelData('upstream/disabled-model', false),
          createModelData('upstream/enabled-model')
        ]
      });

      expect(results.results.map(({ status }) => status)).toEqual(['success', 'success']);
      expect(createModelMock).toHaveBeenCalledWith(
        expect.objectContaining({
          channelType,
          modelData: expect.objectContaining({ model: 'upstream/disabled-model', isActive: false })
        })
      );
      expect(resolveChannelMock).toHaveBeenCalledTimes(2);
      const update = channelType === 'system' ? updateChannelMock : updateGroupChannelMock;
      expect(update).toHaveBeenCalledExactlyOnceWith(1, {
        models: ['existing-model', 'upstream/disabled-model', 'upstream/enabled-model'],
        model_mapping: { 'existing-model': 'vendor/existing-model' }
      });
    }
  );

  it.each([true, false])(
    'rechecks an interrupted binding that committed: %s',
    async (committed) => {
      const model = 'vendor/interrupted-model';
      createModelMock.mockResolvedValueOnce({ modelId: 'created-id' });
      updateChannelMock.mockImplementationOnce(async (_id, patch) => {
        if (committed) Object.assign(channel, patch);
        throw new AxiosError('connection interrupted', 'ECONNRESET');
      });

      const { results } = await importFromChannel({
        channelId: 1,
        ...scope,
        models: [createModelData(model)]
      });

      expect(results).toEqual([
        {
          model,
          modelId: 'created-id',
          ...(committed
            ? { status: 'success' }
            : { status: 'unknown', error: 'connection interrupted' })
        }
      ]);
    }
  );

  it.each(['system', 'team'] as const)(
    'keeps an unconfirmed %s binding unknown after a server error and prefers response body message',
    async (channelType) => {
      const model = 'vendor/unconfirmed-model';
      createModelMock.mockResolvedValueOnce({ modelId: 'created-id' });
      const update = channelType === 'system' ? updateChannelMock : updateGroupChannelMock;
      update.mockRejectedValueOnce(
        Object.assign(new AxiosError('Request failed with status code 500'), {
          response: { status: 500, data: { message: 'failed to bind model to channel' } }
        })
      );

      const { results } = await importFromChannel({
        channelId: 1,
        ...scope,
        channelType,
        models: [createModelData(model)]
      });

      expect(results).toEqual([
        {
          model,
          modelId: 'created-id',
          status: 'unknown',
          error: 'failed to bind model to channel'
        }
      ]);
    }
  );

  it('queues concurrent imports on the same channel so both batches bind without losing models', async () => {
    const updateStarted = Promise.withResolvers<void>();
    const completeUpdate = Promise.withResolvers<void>();
    createModelMock
      .mockResolvedValueOnce({ modelId: 'first-id' })
      .mockResolvedValueOnce({ modelId: 'second-id' });
    updateChannelMock.mockImplementationOnce(async (_id, patch) => {
      updateStarted.resolve();
      await completeUpdate.promise;
      Object.assign(channel, patch);
    });
    const first = importFromChannel({
      ...scope,
      channelId: 1,
      models: [createModelData('first')]
    });
    await Promise.race([updateStarted.promise, first]);

    const second = importFromChannel({
      ...scope,
      channelId: 1,
      tmbId: '60000000000000000000000b',
      models: [createModelData('second')]
    });
    // 第一批尚未释放锁前，第二批只应等待而不抢先覆盖写入。
    await Promise.resolve();
    expect(updateChannelMock).toHaveBeenCalledTimes(1);

    completeUpdate.resolve();
    await expect(first).resolves.toEqual({
      results: [{ status: 'success', model: 'first', modelId: 'first-id' }]
    });
    await expect(second).resolves.toEqual({
      results: [{ status: 'success', model: 'second', modelId: 'second-id' }]
    });
    expect(updateChannelMock).toHaveBeenCalledTimes(2);
    expect(channel.models).toEqual(['first', 'second']);
  });

  it('serializes team import with concurrent manual channel binding without overwriting either', async () => {
    const updateStarted = Promise.withResolvers<void>();
    const completeUpdate = Promise.withResolvers<void>();
    createModelMock.mockResolvedValueOnce({ modelId: 'imported-id' });
    updateGroupChannelMock.mockImplementationOnce(async (_id, patch) => {
      updateStarted.resolve();
      await completeUpdate.promise;
      Object.assign(channel, patch);
    });

    const importing = importFromChannel({
      ...scope,
      channelType: 'team',
      channelId: 1,
      models: [createModelData('imported-model')]
    });
    await Promise.race([updateStarted.promise, importing]);

    const manualBinding = updateModelChannelBindings({
      model: 'manual-model',
      addChannelIds: [1],
      channelType: 'team',
      tmbId: scope.tmbId
    });
    await Promise.resolve();
    expect(updateGroupChannelMock).toHaveBeenCalledTimes(1);

    completeUpdate.resolve();
    await expect(importing).resolves.toEqual({
      results: [{ status: 'success', model: 'imported-model', modelId: 'imported-id' }]
    });
    await expect(manualBinding).resolves.toBeUndefined();
    expect(updateGroupChannelMock).toHaveBeenCalledTimes(2);
    expect(channel.models).toEqual(['imported-model', 'manual-model']);
  });

  it('maps channel write lock timeout and Redis acquire errors to distinct localized codes without leaking internal keys', async () => {
    createModelMock
      .mockResolvedValueOnce({ modelId: 'busy-id' })
      .mockResolvedValueOnce({ modelId: 'redis-down-id' });
    const leaseSpy = vi
      .spyOn(LeaseCache.prototype, 'withConcurrency')
      .mockRejectedValueOnce(
        new RedisLeaseWaitTimeoutError({
          key: `model-channel-write:team:${scope.tmbId}:1`,
          label: 'model-channel-write'
        })
      )
      .mockRejectedValueOnce(
        new RedisLeaseAcquireError({
          key: `model-channel-write:team:${scope.tmbId}:1`,
          label: 'model-channel-write',
          cause: new Error('redis down')
        })
      );

    try {
      const busyRes = await importFromChannel({
        ...scope,
        channelType: 'team',
        channelId: 1,
        models: [createModelData('busy-model')]
      });
      expect(busyRes.results).toEqual([
        {
          status: 'failed',
          model: 'busy-model',
          modelId: 'busy-id',
          error: ModelErrEnum.channelWriteBusy
        }
      ]);
      expect(busyRes.results[0].status === 'failed' && busyRes.results[0].error).not.toContain(
        scope.tmbId
      );

      const acquireRes = await importFromChannel({
        ...scope,
        channelType: 'team',
        channelId: 1,
        models: [createModelData('redis-down-model')]
      });
      expect(acquireRes.results).toEqual([
        {
          status: 'failed',
          model: 'redis-down-model',
          modelId: 'redis-down-id',
          error: ModelErrEnum.serviceUnavailable
        }
      ]);
      expect(
        acquireRes.results[0].status === 'failed' && acquireRes.results[0].error
      ).not.toContain(scope.tmbId);
    } finally {
      leaseSpy.mockRestore();
    }
  });

  it('returns confirmed model IDs when the lease expires just after the write', async () => {
    createModelMock
      .mockResolvedValueOnce({ modelId: 'first-id' })
      .mockResolvedValueOnce({ modelId: 'second-id' });
    const now = Date.now;
    const clock = vi.spyOn(Date, 'now');
    updateChannelMock.mockImplementationOnce(async (_id, patch) => {
      Object.assign(channel, patch);
      clock.mockImplementation(() => now() + 60_001);
    });

    try {
      await expect(
        importFromChannel({
          ...scope,
          channelId: 1,
          models: [createModelData('first'), createModelData('second')]
        })
      ).resolves.toEqual({
        results: [
          { status: 'success', model: 'first', modelId: 'first-id' },
          { status: 'success', model: 'second', modelId: 'second-id' }
        ]
      });
    } finally {
      clock.mockRestore();
    }
    expect(channel.models).toEqual(['first', 'second']);
  });

  it('omits the patch mapping key when the channel has no mappings', async () => {
    delete channel.model_mapping;
    createModelMock.mockResolvedValueOnce({ modelId: 'created-id' });
    await importFromChannel({
      channelId: 1,
      ...scope,
      models: [createModelData('new-upstream')]
    });

    expect(updateChannelMock.mock.calls).toStrictEqual([[1, { models: ['new-upstream'] }]]);
  });

  it('preserves a conflicting alias and does not create a model', async () => {
    channel.model_mapping = { 'new-upstream': 'old-upstream' };

    const results = await importFromChannel({
      channelId: 1,
      ...scope,
      models: [createModelData('new-upstream')]
    });

    expect(results.results[0]).toMatchObject({
      model: 'new-upstream',
      status: 'failed',
      error: ModelErrEnum.channelModelMappingConflict
    });
    expect(createModelMock).not.toHaveBeenCalled();
    expect(updateChannelMock).not.toHaveBeenCalled();
  });

  it('keeps the created ID if a conflicting alias appears before binding', async () => {
    createModelMock.mockImplementationOnce(async () => {
      channel.model_mapping = { 'new-upstream': 'other-upstream' };
      return { modelId: 'created-id' };
    });

    const { results } = await importFromChannel({
      channelId: 1,
      ...scope,
      models: [createModelData('new-upstream')]
    });

    expect(results).toEqual([
      {
        status: 'failed',
        model: 'new-upstream',
        modelId: 'created-id',
        error: ModelErrEnum.channelModelMappingConflict
      }
    ]);
    expect(updateChannelMock).not.toHaveBeenCalled();
  });
});
