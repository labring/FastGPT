import type { Types } from '@fastgpt/service/common/mongo';
import { getLLMRequestRecordExpiredTime } from '@fastgpt/service/core/ai/record/controller';
import {
  LLMRequestRecordExpiredTimeIndexName,
  type MongoLLMRequestRecord
} from '@fastgpt/service/core/ai/record/schema';

export const LEGACY_LLM_RECORD_TTL_INDEX_NAME = 'createdAt_1';

export type LLMRequestRecordCollection = typeof MongoLLMRequestRecord.collection;
type LLMRequestRecordBulkOp = Parameters<LLMRequestRecordCollection['bulkWrite']>[0][number];

type MongoIndexInfo = {
  name?: string;
  key?: Record<string, unknown>;
  expireAfterSeconds?: unknown;
  unique?: unknown;
  sparse?: unknown;
  partialFilterExpression?: unknown;
  collation?: unknown;
  hidden?: unknown;
};

export type LLMRequestRecordMigrationDoc = {
  _id: Types.ObjectId;
  createdAt?: unknown;
  expiredTime?: unknown;
};

const isValidDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

const isMongoErrorCode = (error: unknown, codes: readonly number[]) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof (error as { code?: unknown }).code === 'number' &&
  codes.includes((error as { code: number }).code);

/**
 * 仅识别 FastGPT 历史托管的 `createdAt_1` 单字段 TTL 索引。
 * 忽略带额外选项或非 TTL 的同名索引，避免误删客户 DBA 自建索引。
 */
export const isLegacyCreatedAtTtlIndex = (index: MongoIndexInfo): boolean => {
  if (index.name !== LEGACY_LLM_RECORD_TTL_INDEX_NAME) return false;
  const key = index.key;
  if (!key || Object.keys(key).length !== 1 || key.createdAt !== 1) return false;
  if (typeof index.expireAfterSeconds !== 'number') return false;
  if (index.unique || index.sparse || index.partialFilterExpression || index.collation) {
    return false;
  }
  return true;
};

export const isExpiredTimeTtlIndex = (index: MongoIndexInfo): boolean => {
  const key = index.key;
  if (!key || Object.keys(key).length !== 1 || key.expiredTime !== 1) return false;
  if (index.expireAfterSeconds !== 0) return false;
  if (index.unique || index.sparse || index.partialFilterExpression || index.collation) {
    return false;
  }
  if (index.hidden) return false;
  return true;
};

export const listCollectionIndexesSafe = async (
  collection: LLMRequestRecordCollection
): Promise<MongoIndexInfo[]> => {
  try {
    return (await collection.indexes()) as MongoIndexInfo[];
  } catch (error) {
    // 首次升级或从未落库过追踪日志时集合可能尚未创建。
    if (isMongoErrorCode(error, [26])) {
      return [];
    }
    throw error;
  }
};

/**
 * 幂等确保新的 `expiredTime` 固定 TTL 索引存在，避免删除旧 `createdAt_1` 后出现无 TTL 窗口。
 */
export const ensureExpiredTimeTtlIndex = async (
  collection: LLMRequestRecordCollection
): Promise<void> => {
  const indexes = await listCollectionIndexesSafe(collection);
  if (indexes.some(isExpiredTimeTtlIndex)) {
    return;
  }
  await collection.createIndex(
    { expiredTime: 1 },
    { name: LLMRequestRecordExpiredTimeIndexName, expireAfterSeconds: 0 }
  );
};

/**
 * 安全删除 FastGPT 历史 `createdAt_1` TTL 索引（兼容不同历史保留时长）。
 */
export const dropLegacyCreatedAtTtlIndex = async (
  collection: LLMRequestRecordCollection
): Promise<'dropped' | 'missing' | 'skipped_mismatch'> => {
  const indexes = await listCollectionIndexesSafe(collection);
  const target = indexes.find((index) => index.name === LEGACY_LLM_RECORD_TTL_INDEX_NAME);
  if (!target) {
    return 'missing';
  }
  if (!isLegacyCreatedAtTtlIndex(target)) {
    return 'skipped_mismatch';
  }

  try {
    await collection.dropIndex(LEGACY_LLM_RECORD_TTL_INDEX_NAME);
    return 'dropped';
  } catch (error) {
    if (isMongoErrorCode(error, [26, 27])) {
      return 'missing';
    }
    throw error;
  }
};

/**
 * 幂等回填一批历史 LLM 追踪记录的 `expiredTime` 并移除旧 `createdAt` 字段：
 * - 缺少合法 Date 类型 `expiredTime` 的记录：以 `createdAt`（缺失时回退 ObjectId 时间戳）+ retentionHours 计算；
 * - 已有合法 `expiredTime` 但仍残留 `createdAt` 的记录：仅移除 `createdAt`，不覆写已有 `expiredTime`。
 */
export const backfillLLMRequestRecordBatch = async ({
  collection,
  docs,
  retentionHours
}: {
  collection: LLMRequestRecordCollection;
  docs: readonly LLMRequestRecordMigrationDoc[];
  retentionHours: number;
}): Promise<{ backfilledCount: number }> => {
  const operations: LLMRequestRecordBulkOp[] = [];

  for (const doc of docs) {
    if (!isValidDate(doc.expiredTime)) {
      const baseTime = isValidDate(doc.createdAt) ? doc.createdAt : doc._id.getTimestamp();
      const expiredTime = getLLMRequestRecordExpiredTime(baseTime, retentionHours);

      operations.push({
        updateOne: {
          filter: {
            _id: doc._id,
            expiredTime: { $not: { $type: 'date' } }
          },
          update: {
            $set: { expiredTime },
            $unset: { createdAt: '' }
          }
        }
      });
    } else if (doc.createdAt !== undefined) {
      operations.push({
        updateOne: {
          filter: {
            _id: doc._id,
            createdAt: { $exists: true }
          },
          update: {
            $unset: { createdAt: '' }
          }
        }
      });
    }
  }

  if (operations.length === 0) {
    return { backfilledCount: 0 };
  }

  const result = await collection.bulkWrite(operations, { ordered: false });
  return { backfilledCount: result.modifiedCount };
};
