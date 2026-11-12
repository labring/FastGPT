import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  getDatasetSynonymConfig,
  getDatasetSynonymMatcher
} from '@fastgpt/service/core/dataset/synonym/entity';
import { getSqlFullTextAdapter } from '@fastgpt/service/common/vectorDB/fullText/controller';
import type { SqlFullTextRow } from '@fastgpt/service/common/vectorDB/fullText/type';
import { Types } from '@fastgpt/service/common/mongo';

/**
 * 标记单条业务记录的数据完整性、归属或历史同义词快照错误。
 * 仅此类可预期数据错误记入 failedRecords；数据库连接、超时或 SQL 驱动异常原样上抛给 Runner。
 */
export class SqlFullTextMigrationRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlFullTextMigrationRecordError';
  }
}

/** 按索引记录的历史同义词版本重建输入，图片全文为空；不能用当前词表猜测历史。 */
export const buildSqlFullTextRows = async (
  data: DatasetDataSchemaType
): Promise<SqlFullTextRow[]> => {
  const teamId = String(data.teamId);
  const datasetId = String(data.datasetId);
  const version = data.synonymVersion ?? 0;
  // 图片没有全文输入，明确的版本 0 也不依赖词表；迁移不能额外要求这些历史快照。
  const needsHistory =
    data.indexes.some((index) => index.type !== DatasetDataIndexTypeEnum.imageEmbedding) &&
    (data.synonymVersion === undefined || version > 0);
  const config = needsHistory ? await getDatasetSynonymConfig({ teamId, datasetId }) : null;
  if (data.synonymVersion === undefined && config && config.version > 0) {
    throw new SqlFullTextMigrationRecordError(
      'Historical synonym version is missing; rebuild this data before migrating'
    );
  }
  const matcher =
    needsHistory && version > 0 && !(config?.version === version && !config.enabled)
      ? await getDatasetSynonymMatcher({ teamId, datasetId, fileVersion: version })
      : undefined;
  if (matcher && !matcher.hasMappings) {
    throw new SqlFullTextMigrationRecordError('Historical synonym snapshot is unavailable');
  }
  return data.indexes.map((index) => ({
    vectorId: index.dataId,
    teamId,
    datasetId,
    collectionId: String(data.collectionId),
    text:
      index.type === DatasetDataIndexTypeEnum.imageEmbedding
        ? ''
        : (matcher?.transform(index.text).transformedText ?? index.text)
  }));
};

/** 读取当前 dataset_datas 主库最大 _id 作为分批扫描或校验的固定上界。 */
export const getLatestDatasetDataId = async (): Promise<string | null> => {
  const last = await MongoDatasetData.findOne()
    .sort({ _id: -1 })
    .select('_id')
    .read('primary')
    .lean();
  return last ? String(last._id) : null;
};

/** 按固定上界与游标顺序读取下一批业务记录 ID。 */
export const listDatasetDataBatchIds = async ({
  endId,
  cursor,
  limit
}: {
  endId: string;
  cursor: string | null;
  limit: number;
}): Promise<string[]> => {
  const records: Pick<DatasetDataSchemaType, '_id'>[] = await MongoDatasetData.find({
    _id: {
      $lte: new Types.ObjectId(endId),
      ...(cursor !== null ? { $gt: new Types.ObjectId(cursor) } : {})
    }
  })
    .select('_id')
    .sort({ _id: 1 })
    .limit(limit)
    .read('primary')
    .lean();
  return records.map((record) => String(record._id));
};

/**
 * 三种模式共用当前有效引用核对；执行后再次读取主库，允许并发删除或替换向量 ID。
 * 预检只读且允许 NULL，回填仅补 NULL 词串，验收只读校验词串完整一致；均不修改向量与业务原文。
 */
const processSqlFullTextRecord = async (id: string, mode: 'preflight' | 'fill' | 'validate') => {
  const data = await MongoDatasetData.findById(id).read('primary').lean();
  if (!data) return 0;
  const expected = await buildSqlFullTextRows(data);
  const adapter = getSqlFullTextAdapter();
  const invalid = new Set(
    await (mode === 'preflight'
      ? adapter.preflight(expected)
      : adapter.fill(expected, mode === 'validate'))
  );
  const current = await MongoDatasetData.findById(id).read('primary').lean();
  if (!current) return 0;
  const currentRows = await buildSqlFullTextRows(current);
  const currentById = new Map(currentRows.map((row) => [row.vectorId, row]));
  for (const row of expected) {
    const active = currentById.get(row.vectorId);
    if (!active) continue;
    if (
      invalid.has(row.vectorId) ||
      active.text !== row.text ||
      active.teamId !== row.teamId ||
      active.datasetId !== row.datasetId ||
      active.collectionId !== row.collectionId
    ) {
      throw new SqlFullTextMigrationRecordError(
        'Active vector row is missing, has wrong ownership, or has conflicting full text'
      );
    }
  }
  return expected.filter((row) => currentById.has(row.vectorId)).length;
};

/** 全量预检的单条只读检查，不因目标词串为 NULL 而失败。 */
export const preflightSqlFullTextRecord = (id: string) => processSqlFullTextRecord(id, 'preflight');

/** 回填或验收单条业务块；并发变化后只对仍有效的索引判定失败。 */
export const migrateSqlFullTextRecord = (id: string, validateOnly = false) =>
  processSqlFullTextRecord(id, validateOnly ? 'validate' : 'fill');
