import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { ApplyChangesBody } from '@fastgpt/global/openapi/core/ai/model/api';
import type { AiproxyChannel } from '@fastgpt/service/thirdProvider/aiproxy/type';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createModelMock,
  getSystemModelHandleMock,
  resolveChannelMock,
  getSystemChannelModelsMock,
  getTypeMetasMock,
  listChannelsMock,
  getModelProvidersMock,
  refreshTemplatesMock,
  updateBindingsMock,
  updateChannelMock,
  updateModelStatusMock
} = vi.hoisted(() => ({
  createModelMock: vi.fn(),
  getSystemModelHandleMock: vi.fn(),
  resolveChannelMock: vi.fn(),
  getSystemChannelModelsMock: vi.fn(),
  getTypeMetasMock: vi.fn(),
  listChannelsMock: vi.fn(),
  getModelProvidersMock: vi.fn(),
  refreshTemplatesMock: vi.fn(),
  updateBindingsMock: vi.fn(),
  updateChannelMock: vi.fn(),
  updateModelStatusMock: vi.fn()
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
vi.mock('@fastgpt/service/core/ai/model/channel/binding', () => ({
  updateModelChannelBindings: updateBindingsMock
}));
vi.mock('@fastgpt/service/core/ai/model/service', () => ({
  createModel: createModelMock,
  updateModelStatus: updateModelStatusMock
}));
vi.mock('@fastgpt/service/core/ai/model/template', () => ({
  refreshModelTemplates: refreshTemplatesMock
}));
vi.mock('@fastgpt/service/thirdProvider/aiproxy/client', () => ({
  aiProxyClient: {
    getSystemChannelModels: getSystemChannelModelsMock,
    getTypeMetas: getTypeMetasMock,
    system: { channels: { listAll: listChannelsMock, update: updateChannelMock } }
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
    listChannelsMock.mockResolvedValue([{ ...channel }]);
    getModelProvidersMock.mockReturnValue([{ id: 'openai', name: 'openai' }]);
    refreshTemplatesMock.mockResolvedValue([]);
    updateBindingsMock.mockResolvedValue(undefined);
    updateChannelMock.mockResolvedValue(undefined);
    updateModelStatusMock.mockResolvedValue(undefined);
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

  it('uses the target channel mapping when selecting a current model', async () => {
    channel.models = ['existing-model'];
    channel.model_mapping = { 'existing-model': 'vendor/opaque-id' };
    getSystemChannelModelsMock.mockResolvedValueOnce([{ id: 'vendor/opaque-id' }]);

    const preview = await previewImportFromChannel({
      channelId: 1,
      tmbId: '60000000000000000000000a'
    });

    expect(preview.items[0].candidates).toEqual([
      { category: 'associated', modelId: 'existing-id' }
    ]);
  });

  it('falls through to templates when a target model is mapped to another upstream ID', async () => {
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
    updateBindingsMock.mockImplementation(async ({ model }: { model: string }) => {
      if (model === 'upstream/created-without-binding') throw new Error('binding failed');
    });

    const results = await applyChangesFromChannel({
      channelId: 1,
      tmbId: '60000000000000000000000a',
      teamId: '6000000000000000000000aa',
      operations: [
        {
          action: 'associate',
          providerModelSlug: 'existing-model',
          modelId: 'existing-id',
          isActive: true
        },
        createModelData('duplicate'),
        createModelData('created-without-binding'),
        createModelData('successful')
      ]
    });

    expect(results.results.map(({ status }) => status)).toEqual([
      'success',
      'failed',
      'failed',
      'success'
    ]);
    expect(results.results[1]).toMatchObject({ status: 'failed', error: 'duplicate' });
    expect(results.results[2]).toMatchObject({
      status: 'failed',
      modelId: 'created-id',
      error: 'binding failed'
    });
    expect(results.results[3]).toMatchObject({ status: 'success', modelId: 'successful-id' });
  });

  it('applies enabled state to an already-associated model without changing the channel', async () => {
    channel.models = ['existing-model'];

    const results = await applyChangesFromChannel({
      channelId: 1,
      tmbId: '60000000000000000000000a',
      teamId: '6000000000000000000000aa',
      operations: [
        {
          action: 'associate',
          providerModelSlug: 'existing-model',
          modelId: 'existing-id',
          isActive: false
        }
      ]
    });

    expect(results.results[0]).toMatchObject({
      action: 'associate',
      status: 'skipped',
      modelId: 'existing-id'
    });
    expect(updateModelStatusMock).toHaveBeenCalledWith({
      modelIds: ['existing-id'],
      isActive: false,
      channelType: 'system',
      tmbId: '60000000000000000000000a',
      teamId: '6000000000000000000000aa'
    });
    expect(updateBindingsMock).not.toHaveBeenCalled();
    expect(updateChannelMock).not.toHaveBeenCalled();
  });

  it('adds a missing alias mapping for an already-associated model', async () => {
    channel.models = ['existing-model'];

    const results = await applyChangesFromChannel({
      channelId: 1,
      tmbId: '60000000000000000000000a',
      teamId: '6000000000000000000000aa',
      operations: [
        {
          action: 'associate',
          providerModelSlug: 'vendor/existing-model',
          modelId: 'existing-id',
          isActive: true
        }
      ]
    });

    expect(results.results[0]).toMatchObject({ status: 'skipped', modelId: 'existing-id' });
    expect(updateChannelMock).toHaveBeenCalledWith(1, {
      model_mapping: { 'existing-model': 'vendor/existing-model' }
    });
    expect(updateBindingsMock).not.toHaveBeenCalled();
  });

  it('uses provider model slug for new models and honors enabled state', async () => {
    createModelMock.mockResolvedValueOnce({ modelId: 'disabled-id' });

    const results = await applyChangesFromChannel({
      channelId: 1,
      tmbId: '60000000000000000000000a',
      teamId: '6000000000000000000000aa',
      operations: [
        createModelData('disabled-model', false),
        {
          action: 'associate',
          providerModelSlug: 'existing-model',
          modelId: 'existing-id',
          isActive: true
        }
      ]
    });

    expect(results.results.map(({ status }) => status)).toEqual(['success', 'success']);
    expect(createModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelData: expect.objectContaining({ model: 'upstream/disabled-model', isActive: false })
      })
    );
    expect(updateModelStatusMock).toHaveBeenCalledWith({
      modelIds: ['existing-id'],
      isActive: true,
      channelType: 'system',
      tmbId: '60000000000000000000000a',
      teamId: '6000000000000000000000aa'
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
      error: '渠道别名已映射到其他上游模型'
    });
    expect(createModelMock).not.toHaveBeenCalled();
    expect(updateChannelMock).not.toHaveBeenCalled();
  });
});
