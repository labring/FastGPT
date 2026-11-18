import type { z } from 'zod';
import {
  SqlFullTextMetadataSchema,
  SqlFullTextProviderSchema
} from '@fastgpt/global/core/dataset/fullText/schema';
import { connectionMongo, getMongoModel } from '../../../../common/mongo';

export const SqlFullTextTargetSchema = SqlFullTextMetadataSchema.extend({
  _id: SqlFullTextProviderSchema
});
export type SqlFullTextTarget = z.infer<typeof SqlFullTextTargetSchema>;

/**
 * 记录已完成全量回填与一致性验收的 SQL 物理全文目标。
 * 以 provider 作为 _id 主键精确定位，不额外声明二级索引。
 */
const SqlFullTextTargetMongoSchema = new connectionMongo.Schema<SqlFullTextTarget>({
  _id: {
    type: String,
    required: true,
    enum: SqlFullTextProviderSchema.options
  },
  targetId: { type: String, required: true },
  schemaVersion: { type: Number, required: true },
  analyzerVersion: { type: String, required: true }
});

export const MongoSqlFullTextTarget = getMongoModel<SqlFullTextTarget>(
  'dataset_sql_fulltext_targets',
  SqlFullTextTargetMongoSchema
);
