import { describe, expect, it } from 'vitest';
import { ModelOrderIdsSchema, sortModelOrderItems } from '@fastgpt/global/core/ai/model/order';

describe('sortModelOrderItems', () => {
  it('sorts persisted ranks first and preserves input order for legacy or tied ranks', () => {
    const items = [
      { modelId: 'legacy', sortOrder: undefined },
      { modelId: 'rank-two', sortOrder: 2 },
      { modelId: 'rank-one-a', sortOrder: 1 },
      { modelId: 'rank-one-b', sortOrder: 1 }
    ];

    expect(sortModelOrderItems(items).map(({ modelId }) => modelId)).toEqual([
      'rank-one-a',
      'rank-one-b',
      'rank-two',
      'legacy'
    ]);
  });
});

describe('ModelOrderIdsSchema', () => {
  it('accepts a complete unique model order without a 500-item limit', () => {
    const modelIds = Array.from({ length: 501 }, (_, index) =>
      (index + 1).toString(16).padStart(24, '0')
    );

    expect(ModelOrderIdsSchema.parse(modelIds)).toEqual(modelIds);
  });

  it('rejects duplicate model IDs', () => {
    expect(() =>
      ModelOrderIdsSchema.parse(['68ad85a7463006c963799a05', '68ad85a7463006c963799a05'])
    ).toThrow('modelIds must be unique');
  });
});
