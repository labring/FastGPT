import { describe, expect, it } from 'vitest';
import { SearchDataResponseItemSchema } from '@fastgpt/global/core/dataset/type';
import { InsertDataBodySchema } from '@fastgpt/global/openapi/core/dataset/data/api';

const objectId = '507f1f77bcf86cd799439011';

describe('dataset data metadata API schemas', () => {
  it('keeps metadata in the immediate insert request schema', () => {
    const result = InsertDataBodySchema.parse({
      collectionId: objectId,
      q: 'question',
      metadata: {
        rank: 3,
        nested: { source: 'crm' }
      }
    });

    expect(result.metadata).toEqual({
      rank: 3,
      nested: { source: 'crm' }
    });
  });

  it('accepts arbitrary JSON metadata in search responses', () => {
    const result = SearchDataResponseItemSchema.parse({
      id: objectId,
      datasetId: objectId,
      collectionId: objectId,
      q: 'question',
      a: 'answer',
      updateTime: new Date(),
      sourceName: 'collection',
      chunkIndex: 0,
      score: [],
      metadata: {
        rank: 3,
        enabled: true,
        nested: { source: 'crm' }
      }
    });

    expect(result.metadata).toEqual({
      rank: 3,
      enabled: true,
      nested: { source: 'crm' }
    });
  });
});
