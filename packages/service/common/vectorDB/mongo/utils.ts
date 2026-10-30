import { DatasetEmbeddingDimensions } from '@fastgpt/global/core/dataset/data/embedding/type';

/** MongoDB dotProduct 要求单位向量；保留模型低精度输出的舍入误差，不擅自改变内积语义。 */
export const assertMongoEmbeddingVector = (vector: number[]): void => {
  if (
    vector.length !== DatasetEmbeddingDimensions ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(`MongoDB embedding requires ${DatasetEmbeddingDimensions} finite dimensions`);
  }
  const norm = Math.hypot(...vector);
  if (Math.abs(norm - 1) > 0.01) {
    throw new Error(
      'MongoDB dotProduct requires a unit vector; enable embedding model normalization'
    );
  }
};
