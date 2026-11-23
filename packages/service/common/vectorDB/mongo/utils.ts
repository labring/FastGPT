import { toSqlFullTextTokens } from '../fullText/analyzer';
import { SqlFullTextDataError } from '../fullText/utils';
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

/** MongoDB 的 BSON 大小限制包含向量与归属字段，为这些字段预留空间。 */
export const toMongoFullTextTokens = async (text: string) => {
  const tokens = await toSqlFullTextTokens(text);
  if (Buffer.byteLength(tokens, 'utf8') > 15 * 1024 * 1024) {
    throw new SqlFullTextDataError('MongoDB full-text token string exceeds 15 MiB');
  }
  return tokens;
};
