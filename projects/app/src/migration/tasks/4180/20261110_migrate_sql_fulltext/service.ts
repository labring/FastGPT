import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { getSqlFullTextAdapter } from '@fastgpt/service/common/vectorDB/fullText/controller';
import { buildSqlFullTextRows } from '@fastgpt/service/core/dataset/fullText/sql/service';
import { Types } from '@fastgpt/service/common/mongo';
import type { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';

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
      throw new Error(
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

/**
 * 全量验收通过后清空旧的 Mongo dataset_data_texts 表并核验归零。
 * 新写入已直接随向量行写入原生全文，旧表不再承担读写与兜底职责。
 */
export const clearLegacyMongoFullText = async (): Promise<number> => {
  const { deletedCount } = await MongoDatasetDataText.deleteMany({});
  const remaining = await MongoDatasetDataText.countDocuments({}).read('primary');
  if (remaining !== 0) {
    throw new Error(`Legacy dataset_data_texts cleanup incomplete: ${remaining} remaining`);
  }
  return deletedCount ?? 0;
};
