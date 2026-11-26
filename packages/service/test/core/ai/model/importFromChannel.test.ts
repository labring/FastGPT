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
  resolveChannelForOperation: resolveChannelMock
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

  it('keeps result order and continues after create and binding failures', async () => {
    createModelMock
      .mockRejectedValueOnce(new Error('duplicate'))
      .mockResolvedValueOnce({ modelId: 'created-id' })
      .mockResolvedValueOnce({ modelId: 'successful-id' });
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
      createModelMock.mockResolvedValueOnce({ modelId: 'disabled-id' });
      channel.models = ['existing-model'];
      channel.model_mapping = { 'existing-model': 'vendor/existing-model' };

      const results = await importFromChannel({
        channelId: 1,
        ...scope,
        channelType,
        models: [createModelData('upstream/disabled-model', false)]
      });

      expect(results.results.map(({ status }) => status)).toEqual(['success']);
      expect(createModelMock).toHaveBeenCalledWith(
        expect.objectContaining({
          channelType,
          modelData: expect.objectContaining({ model: 'upstream/disabled-model', isActive: false })
        })
      );
      const update = channelType === 'system' ? updateChannelMock : updateGroupChannelMock;
      expect(update).toHaveBeenCalledExactlyOnceWith(1, {
        models: ['existing-model', 'upstream/disabled-model'],
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
    'keeps an unconfirmed %s binding unknown after a server error',
    async (channelType) => {
      const model = 'vendor/unconfirmed-model';
      createModelMock.mockResolvedValueOnce({ modelId: 'created-id' });
      const update = channelType === 'system' ? updateChannelMock : updateGroupChannelMock;
      update.mockRejectedValueOnce(
        Object.assign(new AxiosError('failed to bind model to channel'), {
          response: { status: 500 }
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

  it('blocks a concurrent import for the same system channel before creating its model', async () => {
    const updateStarted = Promise.withResolvers<void>();
    const completeUpdate = Promise.withResolvers<void>();
    createModelMock.mockResolvedValueOnce({ modelId: 'first-id' });
    updateChannelMock.mockImplementationOnce(async (_id, patch) => {
      updateStarted.resolve();
      await completeUpdate.promise;
      Object.assign(channel, patch);
    });
    const first = importFromChannel({
      channelId: 1,
      ...scope,
      models: [createModelData('first')]
    });
    const second = {
      channelId: 1,
      ...scope,
      tmbId: '60000000000000000000000b',
      models: [createModelData('second')]
    };

    await Promise.race([updateStarted.promise, first]);
    try {
      await expect(importFromChannel(second)).rejects.toMatchObject({
        name: 'RedisLeaseUnavailableError'
      });
      expect(createModelMock).toHaveBeenCalledTimes(1);
    } finally {
      completeUpdate.resolve();
      await first;
    }

    createModelMock.mockResolvedValueOnce({ modelId: 'second-id' });
    const { results } = await importFromChannel(second);
    expect(results).toEqual([{ status: 'success', model: 'second', modelId: 'second-id' }]);
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
});
