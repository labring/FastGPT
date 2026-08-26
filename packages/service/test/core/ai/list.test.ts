import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model.schema';
import { paginateAvailableModels } from '@fastgpt/service/core/ai/list';
import { describe, expect, it } from 'vitest';

const model = ({
  modelId,
  provider,
  name = modelId,
  type = ModelTypeEnum.llm,
  isActive = true
}: {
  modelId: string;
  provider: string;
  name?: string;
  type?: ModelTypeEnum;
  isActive?: boolean;
}) =>
  ({
    modelId,
    model: `provider-${modelId}`,
    name,
    provider,
    type,
    isActive,
    isSystem: true,
    isCustom: false,
    config: {}
  }) as SystemModelDataType;

const providerOrders: Record<string, number> = { anthropic: 1, openai: 2 };
const getProviderOrder = (provider: string) => providerOrders[provider] ?? 100;

describe('paginateAvailableModels', () => {
  const models = [
    model({ modelId: '3', provider: 'openai', name: 'B' }),
    model({ modelId: '2', provider: 'anthropic', name: 'A' }),
    model({ modelId: '1', provider: 'openai', name: 'A' }),
    model({ modelId: '4', provider: 'anthropic', name: 'B', type: ModelTypeEnum.embedding }),
    model({ modelId: '5', provider: 'openai', isActive: false })
  ];

  it('returns a cross-provider page when provider is absent', () => {
    const result = paginateAvailableModels({ models, pageSize: 2, getProviderOrder });

    expect(result.total).toBe(4);
    expect(result.providers).toEqual(['anthropic', 'openai']);
    expect(result.list.map((item) => item.modelId)).toEqual(['2', '4']);
  });

  it('computes providers after model type filtering but before provider filtering', () => {
    const result = paginateAvailableModels({
      models,
      modelType: ModelTypeEnum.llm,
      provider: 'openai',
      pageSize: 10,
      getProviderOrder
    });

    expect(result.providers).toEqual(['anthropic', 'openai']);
    expect(result.total).toBe(2);
    expect(result.list.map((item) => item.modelId)).toEqual(['1', '3']);
  });

  it('returns an empty page for an unknown provider without shrinking providers', () => {
    const result = paginateAvailableModels({
      models,
      provider: 'unknown',
      getProviderOrder
    });

    expect(result.total).toBe(0);
    expect(result.list).toEqual([]);
    expect(result.providers).toEqual(['anthropic', 'openai']);
  });

  it('supports page and offset pagination with stable order', () => {
    expect(
      paginateAvailableModels({ models, pageNum: 2, pageSize: 2, getProviderOrder }).list.map(
        (item) => item.modelId
      )
    ).toEqual(['1', '3']);
    expect(
      paginateAvailableModels({ models, offset: 1, pageSize: 2, getProviderOrder }).list.map(
        (item) => item.modelId
      )
    ).toEqual(['4', '1']);
  });
});
