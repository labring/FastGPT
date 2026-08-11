import { describe, expect, expectTypeOf, it } from 'vitest';
import { ModelTypeEnum } from '../../../core/ai/constants';
import {
  EmbeddingModelItemSchema,
  type EmbeddingModelItemType
} from '../../../core/ai/model.schema';
import { GetSystemInitDataResponseSchema } from '../../../openapi/common/system/api';

const desensitizedEmbeddingModel = {
  type: ModelTypeEnum.embedding,
  provider: 'OpenAI',
  model: 'text-embedding-3-small',
  name: 'Embedding-2',
  defaultToken: 500,
  maxToken: 3000
};

describe('system initialization OpenAPI contract', () => {
  it('fills the default weight for an embedding model without weight', () => {
    expect(
      GetSystemInitDataResponseSchema.parse({
        activeModelList: [desensitizedEmbeddingModel]
      })
    ).toEqual({
      activeModelList: [{ ...desensitizedEmbeddingModel, weight: 0 }]
    });
  });

  it('defaults missing embedding model weight to zero', () => {
    expect(EmbeddingModelItemSchema.parse(desensitizedEmbeddingModel)).toEqual({
      ...desensitizedEmbeddingModel,
      weight: 0
    });
    expectTypeOf<EmbeddingModelItemType['weight']>().toEqualTypeOf<number>();
  });

  it('preserves an explicitly configured embedding model weight', () => {
    expect(EmbeddingModelItemSchema.parse({ ...desensitizedEmbeddingModel, weight: 2 })).toEqual({
      ...desensitizedEmbeddingModel,
      weight: 2
    });
  });
});
