import { describe, expect, it } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { defaultProvider } from '@fastgpt/global/core/ai/model/provider';
import type { AIModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import type {
  ApplyChangesBody,
  PreviewImportFromChannelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import {
  buildBlankChannelModelData,
  buildChannelImportOperation,
  filterChannelImportPreviewItems,
  getChannelImportCandidate,
  getBlankChannelImportDraft
} from '@/pageComponents/model/channelImport';
import { resolveRowSelection } from '@/pageComponents/model/ImportModelFromChannelModal/ModelPreviewStep';

type ImportRow = PreviewImportFromChannelResponse['items'][number];
type ImportItem = ImportRow['candidates'][number];

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
      candidates: [
        {
          category: 'template',
          template: { type: ModelTypeEnum.llm, model: 'template-model' },
          modelData: sourceModel
        }
      ]
    };
    const catalog = { installedModelById: new Map(), templateMap: new Map() };

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

describe('getChannelImportCandidate', () => {
  it('always uses the first ranked candidate', () => {
    const row: ImportRow = {
      providerModelSlug: 'remote/model',
      candidates: [
        { category: 'existing', modelId: 'first-id' },
        {
          category: 'template',
          template: { type: ModelTypeEnum.llm, model: 'second-model' },
          modelData: sourceModel
        }
      ]
    };

    expect(getChannelImportCandidate(row)).toBe(row.candidates[0]);
    expect(() =>
      getChannelImportCandidate({ providerModelSlug: 'remote/empty', candidates: [] })
    ).toThrow('Channel import preview item must include a candidate');
  });
});

describe('filterChannelImportPreviewItems', () => {
  it('filters and searches by the first ranked candidate only', () => {
    const alternateTemplate = createModelData(ModelTypeEnum.embedding);
    const items: ImportRow[] = [
      {
        providerModelSlug: 'remote/chat',
        candidates: [
          { category: 'existing', modelId: 'local-chat' },
          {
            category: 'template',
            template: { type: ModelTypeEnum.embedding, model: 'alternate-embedding' },
            modelData: { ...alternateTemplate, model: 'alternate-embedding' }
          }
        ]
      },
      {
        providerModelSlug: 'remote/embedding',
        candidates: [{ category: 'blank', modelType: ModelTypeEnum.embedding }]
      }
    ];
    const installedModels = [
      {
        modelId: 'local-chat',
        model: 'internal-chat-id',
        name: 'Friendly chat',
        type: ModelTypeEnum.llm
      }
    ];

    expect(
      filterChannelImportPreviewItems({
        items,
        modelType: ModelTypeEnum.llm,
        search: 'FRIENDLY',
        installedModels
      }).map((item) => item.providerModelSlug)
    ).toEqual(['remote/chat']);
    expect(
      filterChannelImportPreviewItems({
        items,
        modelType: ModelTypeEnum.embedding,
        search: 'remote/embedding',
        installedModels
      }).map((item) => item.providerModelSlug)
    ).toEqual(['remote/embedding']);
    expect(
      filterChannelImportPreviewItems({
        items,
        modelType: ModelTypeEnum.embedding,
        search: '',
        installedModels
      }).map((item) => item.providerModelSlug)
    ).toEqual(['remote/embedding']);
    expect(
      filterChannelImportPreviewItems({
        items,
        modelType: '',
        search: 'alternate-embedding',
        installedModels
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
      },
      contextLength: 8192
    };

    expect(getBlankChannelImportDraft(item)).toEqual({
      modelData: item.blankModelData,
      modelType: ModelTypeEnum.embedding,
      provider: 'upstream-provider',
      contextLength: 8192
    });
  });

  it('keeps inferred fields empty instead of using the matched template', () => {
    const item: Extract<ImportItem, { category: 'template' }> = {
      category: 'template',
      template: { type: ModelTypeEnum.llm, model: 'template-model' },
      modelData: sourceModel,
      blankModelData: {},
      contextLength: 8192
    };

    expect(getBlankChannelImportDraft(item)).toEqual({
      modelData: item.blankModelData,
      modelType: undefined,
      provider: undefined,
      contextLength: 8192
    });
  });
});

describe('buildBlankChannelModelData', () => {
  it('requires model type and defaults a missing provider to Other', () => {
    expect(
      buildBlankChannelModelData({
        providerModelSlug: 'upstream/model',
        provider: 'provider',
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

  it('keeps inferred LLM values and sets missing context limits to zero', () => {
    const modelData = buildBlankChannelModelData({
      providerModelSlug: 'upstream/model',
      modelType: ModelTypeEnum.llm,
      provider: ' provider ',
      modelData: {
        inputPrice: 0.2,
        config: { maxContext: 16384 }
      },
      createModelData
    });

    expect(modelData).toMatchObject({
      model: 'upstream/model',
      name: 'upstream/model',
      provider: 'provider',
      inputPrice: 0.2,
      config: { maxContext: 16384, maxResponse: 0 }
    });
  });

  it('defaults a blank LLM quote limit from its context length', () => {
    const modelData = buildBlankChannelModelData({
      providerModelSlug: 'upstream/model',
      modelType: ModelTypeEnum.llm,
      provider: 'provider',
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
      provider: 'provider',
      modelData: { config },
      createModelData
    });

    expect(modelData?.config).toMatchObject(config);
  });

  it('sets an absent embedding context limit to zero', () => {
    const modelData = buildBlankChannelModelData({
      providerModelSlug: 'upstream/embedding',
      modelType: ModelTypeEnum.embedding,
      provider: 'provider',
      createModelData
    });

    expect(modelData).toMatchObject({ config: { maxToken: 0 } });
  });

  it.each([
    [ModelTypeEnum.llm, { maxContext: 16384 }],
    [ModelTypeEnum.embedding, { maxToken: 16384 }],
    [ModelTypeEnum.rerank, { maxToken: 16384 }]
  ] as const)('maps known context length to %s config', (modelType, config) => {
    const modelData = buildBlankChannelModelData({
      providerModelSlug: 'upstream/model',
      modelType,
      provider: 'provider',
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
      provider: 'provider',
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
      provider: 'provider',
      modelData: malformedData,
      createModelData
    });

    expect(modelData).toMatchObject({
      type: ModelTypeEnum.tts,
      config: { voices: [] }
    });
  });
});

describe('buildChannelImportOperation', () => {
  it('associates existing model by stable id', () => {
    const item: ImportItem = {
      category: 'existing',
      modelId: 'model-id'
    };

    expect(buildChannelImportOperation({ providerModelSlug: 'remote/model', item })).toEqual({
      action: 'associate',
      providerModelSlug: 'remote/model',
      modelId: 'model-id',
      isActive: true
    });
    expect(
      buildChannelImportOperation({ providerModelSlug: 'remote/model', item, isActive: false })
    ).toMatchObject({ isActive: false });
  });

  it('uses provider model slug for template-created model identifier', () => {
    const item: ImportItem = {
      category: 'template',
      template: { type: ModelTypeEnum.llm, model: 'template-model' },
      modelData: sourceModel
    };
    const templateData = { ...sourceModel, model: 'selected-template' };

    expect(
      buildChannelImportOperation({
        providerModelSlug: 'remote/model',
        item,
        templateData,
        contextLength: 64000
      })
    ).toEqual({
      action: 'create',
      providerModelSlug: 'remote/model',
      modelData: { ...templateData, model: 'remote/model' },
      isActive: true
    });
    expect(
      buildChannelImportOperation({
        providerModelSlug: 'remote/model',
        item,
        templateData,
        contextLength: 64000,
        isActive: false
      })
    ).toMatchObject({ isActive: false });
    expect(
      buildChannelImportOperation({ providerModelSlug: 'remote/model', item })
    ).toBeUndefined();
  });

  it('keeps an exact channel binding unless a different template is selected', () => {
    const associated: ImportItem = { category: 'associated', modelId: 'model-id' };
    const templateData = { ...sourceModel, model: 'selected-template' };

    expect(
      buildChannelImportOperation({ providerModelSlug: 'remote/model', item: associated })
    ).toEqual({
      action: 'associate',
      providerModelSlug: 'remote/model',
      modelId: 'model-id',
      isActive: true
    });
    expect(
      buildChannelImportOperation({
        providerModelSlug: 'remote/model',
        item: associated,
        templateData,
        contextLength: 64000
      })
    ).toEqual({
      action: 'create',
      providerModelSlug: 'remote/model',
      modelData: { ...templateData, model: 'remote/model' },
      isActive: true
    });
  });

  it('merges upstream limits into the selected template only when building the operation', () => {
    const item: ImportItem = {
      category: 'template',
      template: { type: ModelTypeEnum.llm, model: 'first-template' },
      modelData: sourceModel
    };
    const selectedTemplate = {
      ...sourceModel,
      model: 'second-template',
      config: { ...sourceModel.config, maxContext: 16384, maxResponse: 8192 }
    };

    expect(
      buildChannelImportOperation({
        providerModelSlug: 'remote/model',
        item,
        templateData: selectedTemplate,
        contextLength: 4096,
        maxCompletionTokens: 1024
      })
    ).toMatchObject({
      action: 'create',
      modelData: { model: 'remote/model', config: { maxContext: 4096, maxResponse: 1024 } }
    });
    expect(selectedTemplate.config).toMatchObject({ maxContext: 16384, maxResponse: 8192 });
    expect(
      buildChannelImportOperation({
        providerModelSlug: 'remote/model',
        item,
        templateData: selectedTemplate
      })
    ).toMatchObject({ modelData: { config: { maxContext: 16384, maxResponse: 8192 } } });
  });

  it('creates blank candidates only when model data is available', () => {
    const blank: ImportItem = { category: 'blank' };
    const operation: ApplyChangesBody['operations'][number] = {
      action: 'create',
      providerModelSlug: 'remote/model',
      modelData: sourceModel,
      isActive: true
    };

    expect(
      buildChannelImportOperation({
        providerModelSlug: 'remote/model',
        item: blank,
        modelData: sourceModel
      })
    ).toEqual(operation);
    expect(
      buildChannelImportOperation({ providerModelSlug: 'remote/model', item: blank })
    ).toBeUndefined();
  });
});
