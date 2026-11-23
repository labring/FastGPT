import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import type { ApplyChangesBody } from '@fastgpt/global/openapi/core/ai/model/api';
import type { AiproxyChannel } from '@fastgpt/service/thirdProvider/aiproxy/type';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createModelMock,
  getSystemModelHandleMock,
  resolveChannelMock,
  getSystemChannelModelsMock,
  getTypeMetasMock,
  getModelProvidersMock,
  refreshTemplatesMock,
  updateChannelMock
} = vi.hoisted(() => ({
  createModelMock: vi.fn(),
  getSystemModelHandleMock: vi.fn(),
  resolveChannelMock: vi.fn(),
  getSystemChannelModelsMock: vi.fn(),
  getTypeMetasMock: vi.fn(),
  getModelProvidersMock: vi.fn(),
  refreshTemplatesMock: vi.fn(),
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
    getSystemChannelModels: getSystemChannelModelsMock,
    getTypeMetas: getTypeMetasMock,
    system: { channels: { update: updateChannelMock } }
  }
}));

import {
  applyChangesFromChannel,
  previewImportFromChannel
} from '@fastgpt/service/core/ai/model/importFromChannel';

const createModelData = (
  model: string,
  isActive = true
): ApplyChangesBody['operations'][number] => ({
  action: 'create',
  providerModelSlug: `upstream/${model}`,
  isActive,
  modelData: {
    type: ModelTypeEnum.llm,
    provider: 'openai',
    model,
    name: model,
    scope: ModelScopeEnum.system,
    config: { maxContext: 1000, maxResponse: 100, quoteMaxToken: 500 }
  }
});

describe('apply model imports from channel', () => {
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
    getSystemChannelModelsMock.mockResolvedValue([
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
    updateChannelMock.mockImplementation(async (_id: number, patch: Partial<AiproxyChannel>) => {
      Object.assign(channel, patch);
    });
  });

  it('infers a unique cached provider and keeps context length when type is unresolved', async () => {
    const preview = await previewImportFromChannel({
      channelId: 1,
      tmbId: '60000000000000000000000a'
    });

    expect(preview.items[0]).toMatchObject({ contextLength: 48000, maxCompletionTokens: 2048 });
    expect(preview.items[0].candidates[0]).toMatchObject({
      category: 'blank',
      contextLength: 48000,
      modelData: { provider: 'openai' }
    });
    if (preview.items[0].candidates[0].category === 'blank') {
      expect(preview.items[0].candidates[0].modelData).not.toHaveProperty('config');
    }
  });

  it('keeps preview available when optional provider type metadata fails', async () => {
    getTypeMetasMock.mockRejectedValueOnce(new Error('type metadata unavailable'));

    const preview = await previewImportFromChannel({
      channelId: 1,
      tmbId: '60000000000000000000000a'
    });

    expect(preview.items[0].candidates[0]).toMatchObject({
      category: 'blank',
      contextLength: 48000
    });
    if (preview.items[0].candidates[0].category === 'blank') {
      expect(preview.items[0].candidates[0].modelData).not.toHaveProperty('provider');
    }
  });

  it('maps an unsupported channel catalog to a stable model error', async () => {
    getSystemChannelModelsMock.mockRejectedValueOnce(
      Object.assign(new Error('model catalog is unsupported for this channel type'), {
        status: 501
      })
    );

    await expect(
      previewImportFromChannel({
        channelId: 1,
        tmbId: '60000000000000000000000a'
      })
    ).rejects.toMatchObject({
      name: 'UserError',
      message: ModelErrEnum.channelCatalogUnsupported
    });
  });

  it('excludes configured models by exact name and target-channel alias', async () => {
    channel.models = ['existing-model'];
    channel.model_mapping = { 'existing-model': 'vendor/opaque-id' };
    getSystemChannelModelsMock.mockResolvedValueOnce([
      { id: 'vendor/opaque-id' },
      { id: 'existing-model' },
      { id: 'vendor/new-model' }
    ]);

    const preview = await previewImportFromChannel({
      channelId: 1,
      tmbId: '60000000000000000000000a'
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
    getSystemChannelModelsMock.mockResolvedValueOnce([{ id: 'openai/gpt-4o-mini' }]);
    refreshTemplatesMock.mockResolvedValueOnce([createModelData('gpt-4o-mini').modelData]);

    const preview = await previewImportFromChannel({
      channelId: 1,
      tmbId: '60000000000000000000000a'
    });

    expect(preview.items).toMatchObject([
      {
        providerModelSlug: 'openai/gpt-4o-mini',
        candidates: [{ category: 'template', template: { model: 'gpt-4o-mini' } }]
      }
    ]);
  });

  it('keeps a nonmatching model available when a target alias points elsewhere', async () => {
    channel.models = ['existing-model'];
    channel.model_mapping = { 'existing-model': 'old/provider-id' };
    getSystemChannelModelsMock.mockResolvedValueOnce([{ id: 'vendor/existing-model' }]);

    const preview = await previewImportFromChannel({
      channelId: 1,
      tmbId: '60000000000000000000000a'
    });

    expect(preview.items[0].candidates[0]).toMatchObject({ category: 'blank' });
  });

  it('keeps result order and continues after create and binding failures', async () => {
    createModelMock
      .mockRejectedValueOnce(new Error('duplicate'))
      .mockResolvedValueOnce({ modelId: 'created-id' })
      .mockResolvedValueOnce({ modelId: 'successful-id' });
    updateChannelMock.mockRejectedValueOnce(new Error('binding failed'));

    const results = await applyChangesFromChannel({
      channelId: 1,
      tmbId: '60000000000000000000000a',
      teamId: '6000000000000000000000aa',
      operations: [
        createModelData('duplicate'),
        createModelData('created-without-binding'),
        createModelData('successful')
      ]
    });

    expect(results.results.map(({ status }) => status)).toEqual(['failed', 'failed', 'success']);
    expect(results.results[0]).toMatchObject({ status: 'failed', error: 'duplicate' });
    expect(results.results[1]).toMatchObject({
      status: 'failed',
      modelId: 'created-id',
      error: 'binding failed'
    });
    expect(results.results[2]).toMatchObject({ status: 'success', modelId: 'successful-id' });
  });

  it('uses provider model slug for new models and honors enabled state', async () => {
    createModelMock.mockResolvedValueOnce({ modelId: 'disabled-id' });
    channel.models = ['existing-model'];
    channel.model_mapping = { 'existing-model': 'vendor/existing-model' };

    const results = await applyChangesFromChannel({
      channelId: 1,
      tmbId: '60000000000000000000000a',
      teamId: '6000000000000000000000aa',
      operations: [createModelData('disabled-model', false)]
    });

    expect(results.results.map(({ status }) => status)).toEqual(['success']);
    expect(createModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelData: expect.objectContaining({ model: 'upstream/disabled-model', isActive: false })
      })
    );
    expect(updateChannelMock).toHaveBeenCalledExactlyOnceWith(1, {
      models: ['existing-model', 'upstream/disabled-model'],
      model_mapping: { 'existing-model': 'vendor/existing-model' }
    });
  });

  it('preserves a conflicting alias and does not create a model', async () => {
    channel.model_mapping = { 'new-upstream': 'old-upstream' };

    const results = await applyChangesFromChannel({
      channelId: 1,
      tmbId: '60000000000000000000000a',
      teamId: '6000000000000000000000aa',
      operations: [
        {
          action: 'create',
          providerModelSlug: 'new-upstream',
          modelData: {
            type: ModelTypeEnum.llm,
            provider: 'openai',
            model: 'preferred',
            name: 'Preferred',
            scope: ModelScopeEnum.system,
            config: { maxContext: 1000, maxResponse: 100, quoteMaxToken: 500 }
          },
          isActive: true
        }
      ]
    });

    expect(results.results[0]).toMatchObject({
      action: 'create',
      status: 'failed',
      error: ModelErrEnum.channelModelMappingConflict
    });
    expect(createModelMock).not.toHaveBeenCalled();
    expect(updateChannelMock).not.toHaveBeenCalled();
  });
});
