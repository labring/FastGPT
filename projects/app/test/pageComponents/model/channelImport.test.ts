import { describe, expect, it } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { defaultProvider } from '@fastgpt/global/core/ai/model/provider';
import { computedMaxToken } from '@fastgpt/service/core/ai/utils';
import {
  classifyChannelModels,
  createBlankModelData as createChannelBlankModelData
} from '@fastgpt/service/core/ai/model/importFromChannelUtils';
import type { AIModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import type { PreviewImportFromChannelResponse } from '@fastgpt/global/openapi/core/ai/model/api';
import {
  buildBlankChannelModelData,
  filterChannelImportPreviewItems,
  getBlankChannelImportDraft
} from '@/pageComponents/model/channelImport';
import {
  resolveModelTestTarget,
  resolveRowSelection
} from '@/pageComponents/model/ImportModelFromChannelModal/ModelPreviewStep';

type ImportRow = PreviewImportFromChannelResponse['items'][number];
type ImportItem = ImportRow['candidate'];

const createModelData = (type: ModelTypeEnum): AIModelDocumentDataType => {
  const base = {
    provider: 'provider',
    model: 'model',
    name: 'Model',
    scope: ModelScopeEnum.system,
    charsPointsPrice: 0,
    isActive: false
  };

  if (type === ModelTypeEnum.llm) {
    return {
      ...base,
      type,
      config: {
        maxContext: 64000,
        maxResponse: 16000,
        quoteMaxToken: 0,
        maxTemperature: undefined
      }
    };
  }
  if (type === ModelTypeEnum.embedding) {
    return {
      ...base,
      type,
      config: { defaultToken: 512, maxToken: 8192, weight: 0, batchSize: 1 }
    };
  }
  if (type === ModelTypeEnum.rerank) {
    return { ...base, type, config: { maxToken: 8000 } };
  }
  if (type === ModelTypeEnum.tts) {
    return { ...base, type, config: { voices: [] } };
  }
  return { ...base, type: ModelTypeEnum.stt, config: {} };
};

const createBlankModelData = (type: ModelTypeEnum): AIModelDocumentDataType => {
  const modelData = createModelData(type);
  return modelData.type === ModelTypeEnum.llm
    ? { ...modelData, config: { ...modelData.config, quoteMaxToken: Number.NaN } }
    : modelData;
};

const sourceModel = createModelData(ModelTypeEnum.llm);

describe('resolveRowSelection', () => {
  it('keeps each row override together while preserving preview defaults', () => {
    const row: ImportRow = {
      providerModelSlug: 'remote/model',
      candidate: {
        category: 'template',
        template: { type: ModelTypeEnum.llm, model: 'template-model' },
        modelData: sourceModel
      }
    };
    const catalog = {
      templateMap: new Map()
    };

    expect(resolveRowSelection({ row, catalog })).toMatchObject({
      presetKey: 'llm:template-model',
      modelType: ModelTypeEnum.llm,
      isActive: true
    });
    expect(
      resolveRowSelection({
        row,
        catalog,
        selection: {
          selected: true,
          presetKey: '__blank__',
          modelType: ModelTypeEnum.embedding,
          isActive: false
        }
      })
    ).toMatchObject({
      presetKey: '__blank__',
      modelType: ModelTypeEnum.embedding,
      isActive: false
    });
  });
});

describe('resolveModelTestTarget', () => {
  it('uses the upstream model slug to test the selected template', () => {
    const row: ImportRow = {
      providerModelSlug: 'vendor/gpt-4o',
      candidate: {
        category: 'template',
        template: { type: ModelTypeEnum.llm, model: sourceModel.model },
        modelData: sourceModel
      }
    };
    const catalog = { templateMap: new Map() };
    const target = resolveModelTestTarget({
      row,
      ...resolveRowSelection({ row, catalog }),
      createModelData
    });

    expect(target).toMatchObject({ source: 'draft' });
    if (target?.source !== 'draft') {
      throw new Error('Expected the import test to use a model draft');
    }
    expect(target.getModelData()).toMatchObject({
      model: 'vendor/gpt-4o',
      config: sourceModel.config
    });
  });

  it('applies the upstream limits when a different template is selected', () => {
    const row: ImportRow = {
      providerModelSlug: 'vendor/actual-model',
      contextLength: 32000,
      maxCompletionTokens: 4096,
      candidate: { category: 'blank' }
    };
    const catalog = { templateMap: new Map([['llm:manual-template', sourceModel]]) };
    const target = resolveModelTestTarget({
      row,
      ...resolveRowSelection({ row, catalog, selection: { presetKey: 'llm:manual-template' } }),
      createModelData
    });

    if (target?.source !== 'draft') throw new Error('Expected the selected template draft');
    expect(target.getModelData()).toMatchObject({
      model: 'vendor/actual-model',
      config: { maxContext: 32000, maxResponse: 4096 }
    });
  });

  it('uses upstream limits when switching a matched template to blank', () => {
    const row: ImportRow = {
      providerModelSlug: 'vendor/gpt-4o',
      contextLength: 32000,
      maxCompletionTokens: 4096,
      candidate: {
        category: 'template',
        template: { type: ModelTypeEnum.llm, model: sourceModel.model },
        modelData: sourceModel
      }
    };
    const catalog = { templateMap: new Map() };
    const target = resolveModelTestTarget({
      row,
      ...resolveRowSelection({
        row,
        catalog,
        selection: { presetKey: '__blank__', modelType: ModelTypeEnum.llm }
      }),
      createModelData
    });

    expect(target).toMatchObject({ source: 'draft' });
    if (target?.source !== 'draft') {
      throw new Error('Expected the import test to use a blank model draft');
    }
    expect(target.getModelData()).toMatchObject({
      model: 'vendor/gpt-4o',
      config: { maxContext: 32000, maxResponse: 4096 }
    });
  });
});

describe('filterChannelImportPreviewItems', () => {
  it('filters by current row type and searches the default candidate', () => {
    const items: ImportRow[] = [
      {
        providerModelSlug: 'remote/chat',
        candidate: {
          category: 'template',
          template: { type: ModelTypeEnum.llm, model: 'internal-chat-id' },
          modelData: { ...sourceModel, model: 'internal-chat-id', name: 'Friendly chat' }
        }
      },
      {
        providerModelSlug: 'remote/embedding',
        candidate: { category: 'blank', modelData: { type: ModelTypeEnum.embedding } }
      }
    ];
    const getModelType = (row: ImportRow) =>
      row === items[0] ? ModelTypeEnum.llm : ModelTypeEnum.embedding;
    const input = { items, getModelType };

    expect(
      filterChannelImportPreviewItems({
        ...input,
        modelType: ModelTypeEnum.llm,
        search: 'FRIENDLY'
      }).map((item) => item.providerModelSlug)
    ).toEqual(['remote/chat']);
    expect(
      filterChannelImportPreviewItems({
        ...input,
        modelType: ModelTypeEnum.embedding,
        search: 'remote/embedding'
      }).map((item) => item.providerModelSlug)
    ).toEqual(['remote/embedding']);
    expect(
      filterChannelImportPreviewItems({
        ...input,
        modelType: ModelTypeEnum.embedding,
        search: '',
        getModelType: () => ModelTypeEnum.embedding
      }).map((item) => item.providerModelSlug)
    ).toEqual(['remote/chat', 'remote/embedding']);
    expect(
      filterChannelImportPreviewItems({
        ...input,
        modelType: '',
        search: 'alternate-embedding'
      })
    ).toEqual([]);
  });
});

describe('getBlankChannelImportDraft', () => {
  it('uses upstream template fallback data without leaking template type or provider', () => {
    const item: Extract<ImportItem, { category: 'template' }> = {
      category: 'template',
      template: { type: ModelTypeEnum.llm, model: 'template-model' },
      modelData: sourceModel,
      blankModelData: {
        type: ModelTypeEnum.embedding,
        provider: 'upstream-provider',
        model: 'upstream/model',
        name: 'Upstream model',
        config: { maxToken: 4096 }
      }
    };

    expect(getBlankChannelImportDraft(item)).toEqual(item.blankModelData);
  });

  it('keeps inferred fields empty instead of using the matched template', () => {
    const item: Extract<ImportItem, { category: 'template' }> = {
      category: 'template',
      template: { type: ModelTypeEnum.llm, model: 'template-model' },
      modelData: sourceModel,
      blankModelData: {}
    };

    expect(getBlankChannelImportDraft(item)).toEqual(item.blankModelData);
  });
});

describe('buildBlankChannelModelData', () => {
  it('requires model type and defaults a missing provider to Other', () => {
    expect(
      buildBlankChannelModelData({
        providerModelSlug: 'upstream/model',
        createModelData
      })
    ).toBeUndefined();

    expect(
      buildBlankChannelModelData({
        providerModelSlug: 'upstream/model',
        modelType: ModelTypeEnum.llm,
        createModelData
      })
    ).toMatchObject({ provider: defaultProvider.id });
  });

  it('keeps inferred LLM values and preserves the default response limit', () => {
    const modelData = buildBlankChannelModelData({
      providerModelSlug: 'upstream/model',
      modelType: ModelTypeEnum.llm,
      modelData: { provider: ' provider ', config: { maxContext: 16384 } },
      createModelData
    });

    expect(modelData).toMatchObject({
      model: 'upstream/model',
      name: 'upstream/model',
      provider: 'provider',
      config: { maxContext: 16384, maxResponse: 16000 }
    });
  });

  it('keeps a blank LLM response default through runtime token capping when upstream omits it', () => {
    const blankDraft = createChannelBlankModelData({
      id: 'upstream/model',
      context_length: 32000,
      architecture: { output_modalities: ['text'] }
    });
    const modelData = buildBlankChannelModelData({
      providerModelSlug: 'upstream/model',
      modelData: blankDraft.modelData,
      createModelData
    });

    if (modelData?.type !== ModelTypeEnum.llm) {
      throw new Error('Expected an LLM model from the upstream text modality');
    }

    expect(modelData.config.maxResponse).toBe(16000);
    expect(computedMaxToken({ maxToken: 2048, model: modelData })).toBe(2048);
  });

  it('keeps blank LLM defaults when upstream omits its limits', () => {
    const blankDraft = createChannelBlankModelData({
      id: 'upstream/model',
      architecture: { output_modalities: ['text'] }
    });
    const modelData = buildBlankChannelModelData({
      providerModelSlug: 'upstream/model',
      modelData: blankDraft.modelData,
      createModelData
    });

    expect(modelData).toMatchObject({ config: { maxContext: 64000, maxResponse: 16000 } });
  });

  it('uses the upstream response limit when LLM is selected for an ambiguous model type', () => {
    const [row] = classifyChannelModels({
      channelModels: [
        {
          id: 'upstream/model',
          context_length: 32000,
          architecture: { output_modalities: ['text', 'audio'] },
          top_provider: { max_completion_tokens: 2048 }
        }
      ],
      installedModelNames: [],
      targetChannelModels: [],
      targetModelMappings: {},
      templates: []
    });
    const draft = getBlankChannelImportDraft(row.candidate);
    const modelData = buildBlankChannelModelData({
      providerModelSlug: row.providerModelSlug,
      modelType: ModelTypeEnum.llm,
      modelData: draft,
      contextLength: row.contextLength,
      maxCompletionTokens: row.maxCompletionTokens,
      createModelData
    });

    expect(row.maxCompletionTokens).toBe(2048);
    expect(draft?.type).toBeUndefined();
    if (modelData?.type !== ModelTypeEnum.llm) {
      throw new Error('Expected an LLM model after manual type selection');
    }

    expect(modelData.config).toMatchObject({ maxContext: 32000, maxResponse: 2048 });
    expect(computedMaxToken({ maxToken: 8192, model: modelData })).toBe(2048);
  });

  it('defaults a blank LLM quote limit from its context length', () => {
    const modelData = buildBlankChannelModelData({
      providerModelSlug: 'upstream/model',
      modelType: ModelTypeEnum.llm,
      modelData: { config: { maxContext: 10000 } },
      createModelData: createBlankModelData
    });

    expect(modelData).toMatchObject({ config: { maxContext: 10000, quoteMaxToken: 8000 } });
  });

  it.each([
    [ModelTypeEnum.embedding, { defaultToken: 128, maxToken: 4096 }],
    [ModelTypeEnum.rerank, { maxToken: 512 }]
  ] as const)('maps context limits for %s', (modelType, config) => {
    const modelData = buildBlankChannelModelData({
      providerModelSlug: 'upstream/model',
      modelType,
      modelData: { config },
      createModelData
    });

    expect(modelData?.config).toMatchObject(config);
  });

  it('keeps the blank embedding default when upstream omits its context limit', () => {
    const blankDraft = createChannelBlankModelData({
      id: 'upstream/embedding',
      architecture: { output_modalities: ['embedding'] }
    });
    const modelData = buildBlankChannelModelData({
      providerModelSlug: 'upstream/embedding',
      modelData: blankDraft.modelData,
      createModelData
    });

    expect(modelData).toMatchObject({ config: { maxToken: 8192 } });
  });

  it.each([
    [ModelTypeEnum.llm, { maxContext: 16384 }],
    [ModelTypeEnum.embedding, { maxToken: 16384 }],
    [ModelTypeEnum.rerank, { maxToken: 16384 }]
  ] as const)('maps known context length to %s config', (modelType, config) => {
    const modelData = buildBlankChannelModelData({
      providerModelSlug: 'upstream/model',
      modelType,
      modelData: { config: {} },
      contextLength: 16384,
      createModelData
    });

    expect(modelData?.config).toMatchObject(config);
  });

  it('preserves upstream completion limits while applying context length', () => {
    const modelData = buildBlankChannelModelData({
      providerModelSlug: 'upstream/model',
      modelType: ModelTypeEnum.llm,
      modelData: { config: { maxResponse: 2048 } },
      contextLength: 16384,
      createModelData
    });

    expect(modelData).toMatchObject({ config: { maxContext: 16384, maxResponse: 2048 } });
  });

  it('ignores malformed config arrays and preserves the selected TTS defaults', () => {
    const malformedData = JSON.parse('{"type":"llm","provider":"provider","config":[]}');
    const modelData = buildBlankChannelModelData({
      providerModelSlug: 'upstream/tts',
      modelType: ModelTypeEnum.tts,
      modelData: malformedData,
      createModelData
    });

    expect(modelData).toMatchObject({
      type: ModelTypeEnum.tts,
      config: { voices: [] }
    });
  });
});
