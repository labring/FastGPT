import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { AIModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import {
  classifyChannelModels,
  createBlankModelData,
  inferFastGPTProvider,
  inferChannelModelType,
  mergeTemplateModelData
} from '@fastgpt/service/core/ai/model/importFromChannelUtils';
import { describe, expect, it } from 'vitest';

const createTemplate = (overrides: Partial<AIModelDocumentDataType> = {}) =>
  ({
    type: ModelTypeEnum.llm,
    provider: 'openai',
    model: 'openai/gpt-4o',
    name: 'GPT-4o',
    scope: ModelScopeEnum.system,
    inputPrice: 1,
    outputPrice: 2,
    config: { maxContext: 16000, maxResponse: 4000, quoteMaxToken: 2000 },
    ...overrides
  }) as AIModelDocumentDataType;

describe('channel model import matching', () => {
  it('prefers the most precise local model and uses broad matching only for templates', () => {
    const exactTemplate = classifyChannelModels({
      channelModels: [{ id: 'vendor/gpt-4o' }],
      localModels: [{ modelId: 'associated', model: 'gpt-4o' }],
      targetChannelModels: ['gpt-4o'],
      targetModelMappings: {},
      otherChannelModels: [],
      templates: [createTemplate({ model: 'vendor/gpt-4o' })]
    });
    expect(exactTemplate[0].candidates).toEqual([
      { category: 'associated', modelId: 'associated' }
    ]);

    const existingModel = classifyChannelModels({
      channelModels: [{ id: 'vendor/gpt-4o' }],
      localModels: [{ modelId: 'existing', model: 'vendor/gpt-4o' }],
      targetChannelModels: [],
      targetModelMappings: {},
      otherChannelModels: [],
      templates: [createTemplate({ model: 'vendor/gpt-4o' })]
    });
    expect(existingModel[0].candidates).toEqual([{ category: 'existing', modelId: 'existing' }]);

    const templateFallback = classifyChannelModels({
      channelModels: [{ id: 'openai/gpt-4o' }],
      localModels: [{ modelId: 'prefix', model: 'openai' }],
      targetChannelModels: [],
      targetModelMappings: {},
      otherChannelModels: [],
      templates: [createTemplate({ model: 'openai' })]
    });
    expect(templateFallback[0].candidates[0]).toMatchObject({
      category: 'template',
      template: { model: 'openai' }
    });
  });

  it('assigns a local model to one best upstream row and routes the rest to templates', () => {
    const items = classifyChannelModels({
      channelModels: [{ id: 'gpt-4o' }, { id: 'vendor/gpt-4o' }],
      localModels: [{ modelId: 'gpt-4o', model: 'gpt-4o' }],
      targetChannelModels: [],
      targetModelMappings: {},
      otherChannelModels: [],
      templates: [createTemplate({ model: 'vendor/gpt-4o' })]
    });
    expect(items[0].candidates).toEqual([{ category: 'existing', modelId: 'gpt-4o' }]);
    expect(items[1].candidates[0]).toMatchObject({
      category: 'template',
      template: { model: 'vendor/gpt-4o' }
    });

    const tiedSuffix = classifyChannelModels({
      channelModels: [{ id: 'vendor-a/gpt-4o' }, { id: 'vendor-b/gpt-4o' }],
      localModels: [{ modelId: 'gpt-4o', model: 'gpt-4o' }],
      targetChannelModels: [],
      targetModelMappings: {},
      otherChannelModels: [],
      templates: [createTemplate({ model: 'vendor-b/gpt-4o' })]
    });
    expect(tiedSuffix[0].candidates).toEqual([{ category: 'existing', modelId: 'gpt-4o' }]);
    expect(tiedSuffix[1].candidates[0]).toMatchObject({
      category: 'template',
      template: { model: 'vendor-b/gpt-4o' }
    });

    const mostSpecific = classifyChannelModels({
      channelModels: [{ id: 'vendor/openai/gpt-4o' }],
      localModels: [
        { modelId: 'short', model: 'gpt-4o' },
        { modelId: 'long', model: 'openai/gpt-4o' }
      ],
      targetChannelModels: [],
      targetModelMappings: {},
      otherChannelModels: [],
      templates: []
    });
    expect(mostSpecific[0].candidates).toEqual([{ category: 'existing', modelId: 'long' }]);
  });

  it('respects an existing target alias and sends conflicting aliases to templates', () => {
    const mapped = classifyChannelModels({
      channelModels: [{ id: 'mapped/provider-id' }],
      localModels: [{ modelId: 'associated', model: 'internal-name' }],
      targetChannelModels: ['internal-name'],
      targetModelMappings: { 'internal-name': 'mapped/provider-id' },
      otherChannelModels: [],
      templates: []
    });
    expect(mapped[0].candidates).toEqual([{ category: 'associated', modelId: 'associated' }]);

    const conflicting = classifyChannelModels({
      channelModels: [{ id: 'vendor/internal-name' }],
      localModels: [{ modelId: 'associated', model: 'internal-name' }],
      targetChannelModels: ['internal-name'],
      targetModelMappings: { 'internal-name': 'old/provider-id' },
      otherChannelModels: [],
      templates: [createTemplate({ model: 'vendor/internal-name' })]
    });
    expect(conflicting[0].candidates[0]).toMatchObject({
      category: 'template',
      template: { model: 'vendor/internal-name' }
    });
  });

  it('classifies associated, existing, template, and blank entries', () => {
    const items = classifyChannelModels({
      channelModels: [
        { id: 'gpt-4o' },
        { id: 'claude' },
        { id: 'vendor/embedding' },
        {
          id: 'new-template',
          architecture: { output_modalities: ['text'] },
          context_length: 32000,
          pricing: { prompt: '0.0001', completion: '0.0002' }
        },
        {
          id: 'unlisted-model',
          architecture: { output_modalities: ['text', 'embedding'] },
          context_length: 48000
        }
      ],
      localModels: [
        { modelId: 'associated', model: 'gpt-4o' },
        { modelId: 'existing', model: 'claude' },
        { modelId: 'other-channel', model: 'embedding' }
      ],
      provider: 'provider-from-channel',
      targetChannelModels: ['gpt-4o'],
      targetModelMappings: {},
      otherChannelModels: ['embedding'],
      templates: [createTemplate({ model: 'new-template' })]
    });

    expect(items.map((item) => item.candidates[0].category)).toEqual([
      'associated',
      'existing',
      'blank',
      'template',
      'blank'
    ]);

    const templateItem = items[3].candidates[0];
    expect(templateItem).toMatchObject({
      category: 'template',
      contextLength: 32000,
      modelData: {
        provider: 'openai',
        inputPrice: 1,
        outputPrice: 2,
        config: { maxContext: 32000, maxResponse: 4000, quoteMaxToken: 2000 }
      },
      blankModelData: {
        type: ModelTypeEnum.llm,
        provider: 'provider-from-channel',
        model: 'new-template',
        name: 'new-template',
        config: { maxContext: 32000 }
      }
    });
    if (templateItem.category === 'template') {
      expect(templateItem.modelData.provider).toBe('openai');
      expect(templateItem.blankModelData?.provider).toBe('provider-from-channel');
      expect(templateItem.blankModelData?.config).not.toHaveProperty('maxResponse');
      expect(templateItem.blankModelData).not.toHaveProperty('inputPrice');
      expect(templateItem.blankModelData).not.toHaveProperty('outputPrice');
    }
    if (items[4].category === 'blank') {
      expect(items[4]).toMatchObject({ contextLength: 48000 });
      expect(items[4].modelData?.provider).toBe('provider-from-channel');
      expect(items[4].modelData).not.toHaveProperty('config');
    }
  });

  it('uses matching templates instead of models already linked to another channel', () => {
    const items = classifyChannelModels({
      channelModels: [{ id: 'vendor/gpt-4o' }],
      localModels: [{ modelId: 'source', model: 'gpt-4o' }],
      targetChannelModels: [],
      targetModelMappings: {},
      otherChannelModels: ['gpt-4o'],
      templates: [createTemplate({ model: 'gpt-4o' })]
    });

    expect(items[0].candidates).toEqual([
      expect.objectContaining({
        category: 'template',
        template: { type: ModelTypeEnum.llm, model: 'gpt-4o' }
      })
    ]);
  });
});

describe('channel provider inference', () => {
  const providers = [
    { id: 'openai', name: 'OpenAI' },
    { id: 'anthropic', name: 'Anthropic' }
  ];

  it('uses a unique channel type name match and leaves missing or ambiguous matches unset', () => {
    expect(inferFastGPTProvider({ channelTypeName: ' OpenAI ', providers })).toBe('openai');
    expect(
      inferFastGPTProvider({
        channelTypeName: 'OpenAI',
        providers: [...providers, { id: 'openai-compatible', name: 'OpenAI' }]
      })
    ).toBeUndefined();
    expect(inferFastGPTProvider({ channelTypeName: 'OpenRouter', providers })).toBeUndefined();
  });
});

describe('channel model import drafts', () => {
  it('infers one supported model type and ignores image modality', () => {
    expect(inferChannelModelType(['text', 'image'])).toBe(ModelTypeEnum.llm);
    expect(inferChannelModelType(['text', 'embedding'])).toBeUndefined();
    expect(inferChannelModelType(['image', 'video'])).toBeUndefined();
  });

  it('preserves template prices and merges upstream token limits into a template', () => {
    const modelData = mergeTemplateModelData(createTemplate(), {
      id: 'openai/gpt-4o',
      context_length: 32000,
      top_provider: { max_completion_tokens: 8192 },
      pricing: { prompt: '0.0001' }
    });

    expect(modelData).toMatchObject({
      model: 'openai/gpt-4o',
      inputPrice: 1,
      outputPrice: 2,
      config: { maxContext: 32000, maxResponse: 8192 }
    });
  });

  it('builds a blank draft from upstream fields and defaults missing context to zero', () => {
    const item = createBlankModelData({
      id: 'openai/gpt-4o',
      name: 'GPT-4o',
      architecture: { output_modalities: ['text'] },
      top_provider: { max_completion_tokens: 4096 },
      pricing: { prompt: '0.0001', completion: '0.0002' }
    });

    expect(item).toMatchObject({
      category: 'blank',
      modelType: ModelTypeEnum.llm,
      modelData: {
        type: ModelTypeEnum.llm,
        model: 'openai/gpt-4o',
        name: 'GPT-4o',
        config: { maxContext: 0, maxResponse: 4096 }
      }
    });
    if (item.category === 'blank') {
      expect(item.modelData?.provider).toBeUndefined();
      expect(item.modelData).not.toHaveProperty('inputPrice');
      expect(item.modelData).not.toHaveProperty('outputPrice');
    }
  });

  it('skips fractional context length and falls back to the provider limit', () => {
    const item = createBlankModelData({
      id: 'openai/gpt-4o',
      architecture: { output_modalities: ['text'] },
      context_length: 32000.5,
      top_provider: { context_length: 16000 }
    });

    expect(item).toMatchObject({
      category: 'blank',
      contextLength: 16000,
      modelData: { config: { maxContext: 16000 } }
    });
  });
});
