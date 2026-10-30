import { describe, expect, it } from 'vitest';
import { assertMongoEmbeddingVector } from '@fastgpt/service/common/vectorDB/mongo/utils';

describe('assertMongoEmbeddingVector', () => {
  it('accepts normalized 1536 dimensional vectors and float rounding', () => {
    const vector = [1, ...Array(1535).fill(0)];
    expect(() => assertMongoEmbeddingVector(vector)).not.toThrow();
    expect(() => assertMongoEmbeddingVector(vector.map((v) => v * 0.9995))).not.toThrow();
  });

  it.each(
    [
      [],
      [1],
      Array(1536).fill(0),
      [2, ...Array(1535).fill(0)],
      [NaN, ...Array(1535).fill(0)],
      [Infinity, ...Array(1535).fill(0)]
    ].map((vector) => ({ vector }))
  )('rejects invalid dimensions, zero, non-unit and non-finite vectors', ({ vector }) => {
    expect(() => assertMongoEmbeddingVector(vector)).toThrow();
  });
});
