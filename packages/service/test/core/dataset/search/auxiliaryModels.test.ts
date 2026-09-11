import { getCachedModelHandle } from '@fastgpt/service/core/ai/config/handle';
import {
  getModelTestMap,
  getModelTestDefaults,
  setModelTestMap,
  setModelTestSnapshot
} from '@test/modelCache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  LLMSystemModelDataType,
  RerankSystemModelDataType
} from '@fastgpt/global/core/ai/model.schema';
import { UserError } from '@fastgpt/global/common/error/utils';

import { getDatasetSearchAuxiliaryModels as resolveModels } from '../../../../core/dataset/search/auxiliaryModels';

const getDatasetSearchAuxiliaryModels = (input: Parameters<typeof resolveModels>[0]) =>
  resolveModels(input, getCachedModelHandle()!);

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
  let previousMap: ReturnType<typeof getModelTestMap>;
  let previousDefaults: ReturnType<typeof getModelTestDefaults>;

  beforeEach(() => {
    previousMap = getModelTestMap();
    previousDefaults = getModelTestDefaults();
    const models = [
      llm,
      rerank,
      { ...llm, modelId: 'selected-llm', model: 'selected-llm' },
      { ...rerank, modelId: 'selected-rerank', model: 'selected-rerank' },
      { ...llm, modelId: 'disabled-llm', model: 'disabled-llm', isActive: false },
      { ...rerank, modelId: 'disabled-rerank', model: 'disabled-rerank', isActive: false }
    ];
    setModelTestMap(
      new Map(
        models.flatMap((model) => [
          [`id:${model.modelId}`, model],
          [`model:${model.model}`, model]
        ])
      )
    );
    setModelTestSnapshot({ defaultModels: { llm, rerank } });
  });

  afterEach(() => {
    setModelTestMap(previousMap);
    setModelTestSnapshot({ defaultModels: previousDefaults });
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
    const getDefaultModelData = vi.fn();
    expect(
      resolveModels(
        {
          usingReRank: false,
          datasetSearchUsingExtensionQuery: false
        },
        { ...getCachedModelHandle()!, getDefaultModelData }
      )
    ).toEqual({ rerankModelData: undefined, extensionModelData: undefined });
    expect(getDefaultModelData).not.toHaveBeenCalled();
  });

  it.each(['missing', 'disabled'])(
    'skips the optional enhancement when default models are also %s',
    (state) => {
      setModelTestSnapshot({
        defaultModels:
          state === 'missing'
            ? {}
            : { llm: { ...llm, isActive: false }, rerank: { ...rerank, isActive: false } }
      });
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
      expect(() =>
        resolveModels(
          { datasetSearchUsingExtensionQuery: true },
          {
            ...getCachedModelHandle()!,
            getLLMModelData: () => {
              throw error;
            }
          }
        )
      ).toThrow(error);
    }
  );
});
