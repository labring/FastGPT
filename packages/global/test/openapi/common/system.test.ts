import { describe, expect, expectTypeOf, it } from 'vitest';
import { ModelTypeEnum } from '../../../core/ai/constants';
import {
  MyEmbeddingModelItemSchema,
  type MyEmbeddingModelItemType,
  MyLLMModelItemSchema
} from '../../../openapi/core/ai/model/api';
import { GetSystemInitDataResponseSchema } from '../../../openapi/common/system/api';
import { StandardSubLevelEnum } from '../../../support/wallet/sub/constants';

const desensitizedEmbeddingModel = {
  modelId: '68ad85a7463006c963799a01',
  type: ModelTypeEnum.embedding,
  provider: 'OpenAI',
  model: 'text-embedding-3-small',
  name: 'Embedding-2',
  scope: 'system' as const,
  isCustom: false,
  config: {
    defaultToken: 500,
    maxToken: 3000
  }
};

describe('system initialization OpenAPI contract', () => {
  it('drops the legacy active model list and strips sensitive fields from default models', () => {
    const modelWithSecrets = {
      ...desensitizedEmbeddingModel,
      requestUrl: 'https://provider.example/v1',
      requestAuth: 'model-secret',
      config: {
        ...desensitizedEmbeddingModel.config,
        defaultConfig: { secret: 'default-config' },
        dbConfig: { secret: 'db-config' },
        queryConfig: { secret: 'query-config' }
      }
    };

    const result = GetSystemInitDataResponseSchema.parse({
      activeModelList: [modelWithSecrets],
      defaultModels: { embedding: modelWithSecrets }
    });

    expect(result).not.toHaveProperty('activeModelList');
    expect(result.defaultModels?.embedding).not.toHaveProperty('requestUrl');
    expect(result.defaultModels?.embedding).not.toHaveProperty('requestAuth');
    expect(result.defaultModels?.embedding).not.toHaveProperty('defaultConfig');
    expect(result.defaultModels?.embedding).not.toHaveProperty('dbConfig');
    expect(result.defaultModels?.embedding).not.toHaveProperty('queryConfig');
    expect(JSON.stringify(result)).not.toContain('model-secret');
  });

  it('accepts legacy partial standard plans with a stored activity expiration date', () => {
    const activityExpirationTime = new Date('2026-08-31T16:00:00.000Z');
    const plan = {
      price: 0,
      totalPoints: 100,
      maxTeamMember: 1,
      maxAppAmount: 10,
      maxDatasetAmount: 3,
      maxDatasetSize: 600,
      chatHistoryStoreDuration: 30
    };

    const result = GetSystemInitDataResponseSchema.parse({
      subPlans: {
        standard: {
          [StandardSubLevelEnum.free]: plan,
          [StandardSubLevelEnum.basic]: plan,
          [StandardSubLevelEnum.advanced]: plan,
          [StandardSubLevelEnum.custom]: {
            name: 'Custom Plan',
            customFormUrl: 'https://example.com/contact'
          }
        },
        activityExpirationTime
      }
    });

    expect(result.subPlans?.standard).toEqual({
      [StandardSubLevelEnum.free]: plan,
      [StandardSubLevelEnum.basic]: plan,
      [StandardSubLevelEnum.advanced]: plan,
      [StandardSubLevelEnum.custom]: {
        name: 'Custom Plan',
        customFormUrl: 'https://example.com/contact'
      }
    });
    expect(result.subPlans?.activityExpirationTime).toEqual(new Date(activityExpirationTime));
  });

  it.each(['', null, '2026-08-31T16:00:00.000Z'])(
    'rejects a non-Date activity expiration value at read time',
    (value) => {
      expect(() =>
        GetSystemInitDataResponseSchema.parse({
          subPlans: { activityExpirationTime: value }
        })
      ).toThrow();
    }
  );

  it('rejects dirty subscription values at read time', () => {
    expect(() =>
      GetSystemInitDataResponseSchema.parse({
        subPlans: {
          standard: {
            [StandardSubLevelEnum.custom]: {
              priceDesc: '定制化计费',
              customDescriptions: ['专属客户经理'],
              customFormUrl: 'https://example.com/contact'
            }
          },
          extraDatasetSize: { price: '4' }
        }
      })
    ).toThrow();
  });

  it('fills the default weight for an embedding model without weight', () => {
    expect(
      GetSystemInitDataResponseSchema.parse({
        defaultModels: { embedding: desensitizedEmbeddingModel }
      })
    ).toEqual({
      defaultModels: {
        embedding: {
          ...desensitizedEmbeddingModel,
          config: { ...desensitizedEmbeddingModel.config, weight: 0 }
        }
      }
    });
  });

  it('defaults missing embedding model weight to zero', () => {
    expect(MyEmbeddingModelItemSchema.parse(desensitizedEmbeddingModel)).toEqual({
      ...desensitizedEmbeddingModel,
      config: { ...desensitizedEmbeddingModel.config, weight: 0 }
    });
    expectTypeOf<MyEmbeddingModelItemType['config']['weight']>().toEqualTypeOf<number>();
  });

  it('preserves an explicitly configured embedding model weight', () => {
    expect(
      MyEmbeddingModelItemSchema.parse({
        ...desensitizedEmbeddingModel,
        config: { ...desensitizedEmbeddingModel.config, weight: 2 }
      })
    ).toEqual({
      ...desensitizedEmbeddingModel,
      config: { ...desensitizedEmbeddingModel.config, weight: 2 }
    });
  });

  it('accepts an LLM model without functionCall', () => {
    expect(
      MyLLMModelItemSchema.parse({
        modelId: '68ad85a7463006c963799a02',
        type: ModelTypeEnum.llm,
        provider: 'OpenAI',
        model: 'gpt-5',
        name: 'GPT-5',
        scope: 'system',
        isCustom: false,
        config: {
          maxContext: 128000,
          maxResponse: 16000,
          quoteMaxToken: 12000
        }
      })
    ).not.toHaveProperty('config.functionCall');
  });
});
