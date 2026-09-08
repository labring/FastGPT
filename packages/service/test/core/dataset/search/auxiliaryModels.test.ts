import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  LLMSystemModelDataType,
  RerankSystemModelDataType
} from '@fastgpt/global/core/ai/model.schema';
import { UserError } from '@fastgpt/global/common/error/utils';
import * as modelGetters from '../../../../core/ai/model';
import { getDatasetSearchAuxiliaryModels } from '../../../../core/dataset/search/auxiliaryModels';

describe('getDatasetSearchAuxiliaryModels', () => {
  const llm: LLMSystemModelDataType = {
    modelId: 'default-llm',
    model: 'default-llm',
    name: 'Default LLM',
    type: ModelTypeEnum.llm,
    scope: ModelScopeEnum.system,
    provider: 'OpenAI',
    isActive: true,
    isCustom: false,
    config: { maxContext: 4096, maxResponse: 1024, quoteMaxToken: 1024 }
  };
  const rerank: RerankSystemModelDataType = {
    modelId: 'default-rerank',
    model: 'default-rerank',
    name: 'Default Rerank',
    type: ModelTypeEnum.rerank,
    scope: ModelScopeEnum.system,
    provider: 'OpenAI',
    isActive: true,
    isCustom: false,
    config: {}
  };
  let previousMap: typeof global.systemModelMap;
  let previousDefaults: typeof global.systemDefaultModel;

  beforeEach(() => {
    previousMap = global.systemModelMap;
    previousDefaults = global.systemDefaultModel;
    const models = [
      llm,
      rerank,
      { ...llm, modelId: 'selected-llm', model: 'selected-llm' },
      { ...rerank, modelId: 'selected-rerank', model: 'selected-rerank' },
      { ...llm, modelId: 'disabled-llm', model: 'disabled-llm', isActive: false },
      { ...rerank, modelId: 'disabled-rerank', model: 'disabled-rerank', isActive: false }
    ];
    global.systemModelMap = new Map(
      models.flatMap((model) => [
        [`id:${model.modelId}`, model],
        [`model:${model.model}`, model]
      ])
    );
    global.systemDefaultModel = { llm, rerank };
  });

  afterEach(() => {
    global.systemModelMap = previousMap;
    global.systemDefaultModel = previousDefaults;
    vi.restoreAllMocks();
  });

  it('uses available configured models before defaults', () => {
    const result = getDatasetSearchAuxiliaryModels({
      usingReRank: true,
      rerankModelId: 'selected-rerank',
      datasetSearchUsingExtensionQuery: true,
      datasetSearchExtensionModelId: 'selected-llm'
    });
    expect(result.rerankModelData?.modelId).toBe('selected-rerank');
    expect(result.extensionModelData?.modelId).toBe('selected-llm');
  });

  it.each([
    [undefined, undefined],
    ['', ''],
    [' ', ' '],
    ['missing-rerank', 'missing-llm'],
    ['disabled-rerank', 'disabled-llm'],
    ['selected-llm', 'selected-rerank']
  ])(
    'falls back for unset, missing, disabled or wrong-type references (%s / %s)',
    (rerankModelId, datasetSearchExtensionModelId) => {
      expect(
        getDatasetSearchAuxiliaryModels({
          usingReRank: true,
          rerankModelId,
          datasetSearchUsingExtensionQuery: true,
          datasetSearchExtensionModelId
        })
      ).toEqual({ rerankModelData: rerank, extensionModelData: llm });
    }
  );

  it('does not resolve defaults for disabled features', () => {
    const llmSpy = vi.spyOn(modelGetters, 'getDefaultLLMModelData');
    const rerankSpy = vi.spyOn(modelGetters, 'getDefaultRerankModelData');
    expect(
      getDatasetSearchAuxiliaryModels({
        usingReRank: false,
        datasetSearchUsingExtensionQuery: false
      })
    ).toEqual({ rerankModelData: undefined, extensionModelData: undefined });
    expect(llmSpy).not.toHaveBeenCalled();
    expect(rerankSpy).not.toHaveBeenCalled();
  });

  it.each(['missing', 'disabled'])(
    'skips the optional enhancement when default models are also %s',
    (state) => {
      global.systemDefaultModel =
        state === 'missing'
          ? {}
          : { llm: { ...llm, isActive: false }, rerank: { ...rerank, isActive: false } };
      expect(
        getDatasetSearchAuxiliaryModels({
          usingReRank: true,
          datasetSearchUsingExtensionQuery: true
        })
      ).toEqual({ rerankModelData: undefined, extensionModelData: undefined });
    }
  );

  it.each([new Error('unexpected failure'), new UserError('unAuth')])(
    'does not swallow unrelated errors (%s)',
    (error) => {
      vi.spyOn(modelGetters, 'getLLMModelData').mockImplementationOnce(() => {
        throw error;
      });
      expect(() =>
        getDatasetSearchAuxiliaryModels({ datasetSearchUsingExtensionQuery: true })
      ).toThrow(error);
    }
  );
});
