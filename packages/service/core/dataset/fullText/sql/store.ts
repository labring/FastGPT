import type { z } from 'zod';
import {
  SqlFullTextMetadataSchema,
  SqlFullTextProviderSchema,
  type SqlFullTextMetadata,
  type SqlFullTextProvider
} from '@fastgpt/global/core/dataset/fullText/schema';
import { connectionMongo, getMongoModel } from '../../../../common/mongo';
import { getVectorType } from '../../../../common/vectorDB/constants';
import type { FullTextSearchProps, FullTextSearchItem } from '../../../../common/vectorDB/type';
import { getSqlFullTextAdapter } from '../../../../common/vectorDB/fullText/controller';
import { MongoDatasetData } from '../../data/schema';

const SqlFullTextTargetSchema = SqlFullTextMetadataSchema.extend({
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
    enum: ['pg', 'oceanbase', 'seekdb', 'opengauss']
  },
  targetId: { type: String, required: true },
  schemaVersion: { type: Number, required: true },
  analyzerVersion: { type: String, required: true }
});

export const MongoSqlFullTextTarget = getMongoModel<SqlFullTextTarget>(
  'dataset_sql_fulltext_targets',
  SqlFullTextTargetMongoSchema
);

/**
 * 标记当前 provider 对应的物理 SQL 目标已完成历史回填和全量验收，允许切换原生全文读取。
 */
export const activateSqlFullTextTarget = async ({
  provider,
  targetId,
  schemaVersion,
  analyzerVersion
}: {
  provider: SqlFullTextProvider;
} & SqlFullTextMetadata) => {
  await MongoSqlFullTextTarget.updateOne(
    { _id: provider },
    {
      $set: {
        targetId,
        schemaVersion,
        analyzerVersion
      }
    },
    { upsert: true }
  );
};

/**
 * 清理指定 provider 的全文切读就绪标记；重跑预检/回填期间回退至兼容读取。
 */
export const clearSqlFullTextTargetReady = async (provider: SqlFullTextProvider) => {
  await MongoSqlFullTextTarget.deleteOne({ _id: provider });
};

/**
 * 核验当前 SQL 目标是否已通过回填与验收：既要求 Mongo 侧登记了该目标，
 * 也要求当前连接的 SQL 物理库元数据（targetId、schemaVersion、analyzerVersion）完全匹配。
 */
export const isSqlFullTextTargetReady = async (): Promise<boolean> => {
  const provider = getVectorType();
  if (provider === 'milvus') return false;
  try {
    const record = await MongoSqlFullTextTarget.findById(provider).read('primary').lean();
    if (!record) return false;
    const target = SqlFullTextTargetSchema.parse(record);
    const adapter = getSqlFullTextAdapter(provider);
    if (target.analyzerVersion !== adapter.analyzerVersion) return false;
    const metadata = await adapter.getMetadata();
    return (
      metadata.targetId === target.targetId &&
      metadata.schemaVersion === target.schemaVersion &&
      metadata.analyzerVersion === target.analyzerVersion
    );
  } catch {
    return false;
  }
};

/**
 * 原生返回向量 ID，按当前主库引用、团队及知识库归属验证后映射为业务 ID。
 * 候选逐步扩大且最多 500 条；删除和旧向量残留不会变成有效业务命中。
 */
export const searchSqlFullText = async (
  props: FullTextSearchProps
): Promise<FullTextSearchItem[]> => {
  if (props.limit <= 0 || !props.query.trim() || !props.datasetIds.length) return [];
  const results: FullTextSearchItem[] = [];
  const seen = new Set<string>();
  let budget = Math.min(500, Math.max(props.limit, props.limit * 2));
  while (budget > 0) {
    const hits = await getSqlFullTextAdapter().search({ ...props, limit: budget });
    const docs = await MongoDatasetData.find(
      {
        teamId: props.teamId,
        datasetId: { $in: props.datasetIds },
        collectionId: { $in: hits.map((hit) => hit.collectionId) },
        'indexes.dataId': { $in: hits.map((hit) => hit.vectorId) }
      },
      { _id: 1, teamId: 1, datasetId: 1, collectionId: 1, indexes: 1 }
    )
      .read('primary')
      .lean();
    const mapping = new Map(
      docs.flatMap((doc) =>
        doc.indexes.map(
          (index) => [`${doc.collectionId}:${index.dataId}`, String(doc._id)] as const
        )
      )
    );
    for (const hit of hits) {
      const dataId = mapping.get(`${hit.collectionId}:${hit.vectorId}`);
      if (!dataId || seen.has(dataId)) continue;
      seen.add(dataId);
      results.push({ dataId, collectionId: hit.collectionId, score: hit.score });
      if (results.length >= props.limit) return results;
    }
    if (hits.length < budget || budget === 500) break;
    budget = Math.min(500, budget * 2);
  }
  return results;
};
