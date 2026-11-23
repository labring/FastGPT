import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { AIModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import { PreviewImportFromChannelResponseSchema } from '@fastgpt/global/openapi/core/ai/model/api';
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
  it('prefers a suffix template over a prefix template for an unconfigured model', () => {
    const [item] = classifyChannelModels({
      channelModels: [{ id: 'openai/gpt-4o' }],
      installedModelNames: ['openai'],
      targetChannelModels: [],
      targetModelMappings: {},
      templates: [createTemplate({ model: 'openai' }), createTemplate({ model: 'gpt-4o' })]
    });
    expect(item.candidates).toEqual([
      expect.objectContaining({
        category: 'template',
        template: { model: 'gpt-4o', type: ModelTypeEnum.llm }
      })
    ]);
  });

  it('preserves template limits when upstream context length is missing', () => {
    const [preview] = classifyChannelModels({
      channelModels: [{ id: 'openai/gpt-4o' }],
      installedModelNames: [],
      targetChannelModels: [],
      targetModelMappings: {},
      templates: [
        createTemplate({
          config: { maxContext: 128000, maxResponse: 16000, quoteMaxToken: 120000 }
        })
      ]
    });

    expect(preview.contextLength).toBeUndefined();
    expect(preview.candidates[0]).toMatchObject({
      category: 'template',
      modelData: { config: { maxContext: 128000, maxResponse: 16000 } }
    });
  });

  it('excludes an exact installed name and retains every suffix-only match', () => {
    const items = classifyChannelModels({
      channelModels: [{ id: 'gpt-4o' }, { id: 'vendor-a/gpt-4o' }, { id: 'vendor-b/gpt-4o' }],
      installedModelNames: ['gpt-4o'],
      targetChannelModels: [],
      targetModelMappings: {},
      templates: [createTemplate({ model: 'vendor-b/gpt-4o' })]
    });

    expect(items).toMatchObject([
      { providerModelSlug: 'vendor-a/gpt-4o', candidates: [{ category: 'blank' }] },
      {
        providerModelSlug: 'vendor-b/gpt-4o',
        candidates: [{ category: 'template', template: { model: 'vendor-b/gpt-4o' } }]
      }
    ]);
  });

  it('respects an existing target alias and sends conflicting aliases to templates', () => {
    const mapped = classifyChannelModels({
      channelModels: [{ id: 'mapped/provider-id' }],
      installedModelNames: ['internal-name'],
      targetChannelModels: ['internal-name'],
      targetModelMappings: { 'internal-name': 'mapped/provider-id' },
      templates: []
    });
    expect(mapped).toEqual([]);

    const conflicting = classifyChannelModels({
      channelModels: [{ id: 'vendor/internal-name' }],
      installedModelNames: ['internal-name'],
      targetChannelModels: ['internal-name'],
      targetModelMappings: { 'internal-name': 'old/provider-id' },
      templates: [createTemplate({ model: 'vendor/internal-name' })]
    });
    expect(conflicting[0].candidates[0]).toMatchObject({
      category: 'template',
      template: { model: 'vendor/internal-name' }
    });
  });

  it('filters installed entries and preserves the template and blank drafts', () => {
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
      installedModelNames: ['gpt-4o', 'claude', 'embedding'],
      provider: 'provider-from-channel',
      targetChannelModels: ['gpt-4o'],
      targetModelMappings: {},
      templates: [createTemplate({ model: 'new-template' })]
    });

    expect(items.map((item) => item.candidates[0].category)).toEqual([
      'blank',
      'template',
      'blank'
    ]);

    const templateItem = items[1].candidates[0];
    expect(templateItem).toMatchObject({
      category: 'template',
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
    const blankItem = items[2].candidates[0];
    expect(items[2].contextLength).toBe(48000);
    expect(blankItem.category).toBe('blank');
    expect(blankItem).toMatchObject({ modelData: { provider: 'provider-from-channel' } });
    if (blankItem.category === 'blank') expect(blankItem.modelData).not.toHaveProperty('config');
  });

  it('falls back to model IDs for blank upstream names in mixed directories', () => {
    const items = classifyChannelModels({
      channelModels: [
        {
          id: 'vendor/unlisted',
          name: '',
          architecture: { output_modalities: ['text'] }
        },
        {
          id: 'vendor/gpt-4o',
          name: '   ',
          architecture: { output_modalities: ['text'] }
        },
        {
          id: 'vendor/custom',
          name: '  Custom Model  ',
          architecture: { output_modalities: ['text'] }
        }
      ],
      installedModelNames: [],
      targetChannelModels: [],
      targetModelMappings: {},
      templates: [createTemplate({ model: 'gpt-4o' })]
    });
    const response = PreviewImportFromChannelResponseSchema.parse({ items });

    expect(response.items).toHaveLength(3);
    expect(response.items[0].candidates[0]).toMatchObject({
      category: 'blank',
      modelData: { name: 'vendor/unlisted' }
    });
    expect(response.items[1].candidates[0]).toMatchObject({
      category: 'template',
      blankModelData: { name: 'vendor/gpt-4o' }
    });
    expect(response.items[2].candidates[0]).toMatchObject({
      category: 'blank',
      modelData: { name: 'Custom Model' }
    });
  });

  it('only hides mapped upstream IDs for installed models bound to the target channel', () => {
    const items = classifyChannelModels({
      channelModels: [{ id: 'vendor/bound' }, { id: 'vendor/deleted' }, { id: 'vendor/unbound' }],
      installedModelNames: ['bound', 'unbound'],
      targetChannelModels: ['bound', 'deleted'],
      targetModelMappings: {
        bound: 'vendor/bound',
        deleted: 'vendor/deleted',
        unbound: 'vendor/unbound'
      },
      templates: []
    });

    expect(items.map(({ providerModelSlug }) => providerModelSlug)).toEqual([
      'vendor/deleted',
      'vendor/unbound'
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

  it.each([
    ['embeddings', ModelTypeEnum.embedding],
    ['speech', ModelTypeEnum.tts],
    ['transcription', ModelTypeEnum.stt]
  ] as const)('uses the upstream %s modality in blank drafts', (modality, modelType) => {
    const item = createBlankModelData({
      id: 'vendor/model',
      architecture: { output_modalities: [modality] }
    });

    expect(item).toMatchObject({ modelType, modelData: { type: modelType } });
    expect(inferChannelModelType([modality, 'text'])).toBeUndefined();
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

  it('keeps missing context absent from an upstream blank draft', () => {
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
        config: { maxResponse: 4096 }
      }
    });
    if (item.category === 'blank') {
      expect(item.modelData).not.toHaveProperty('config.maxContext');
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
