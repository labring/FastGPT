import {
  dropManagedMongoIndexIfExists,
  hasMatchingMongoIndex
} from '@fastgpt/dal/db/mongo/indexSync';
import { connectionLogMongo, Types } from '@fastgpt/service/common/mongo';
import { getLLMRequestRecordExpiredTime } from '@fastgpt/service/core/ai/record/controller';
import {
  LLMRequestRecordCollectionName,
  LLMRequestRecordExpiredTimeIndexName,
  MongoLLMRequestRecord
} from '@fastgpt/service/core/ai/record/schema';

export const LEGACY_LLM_RECORD_TTL_INDEX_NAME = 'createdAt_1';

export type LLMRequestRecordMigrationItem = {
  id: string;
  idTimestamp: Date;
  createdAt?: Date;
  hasValidExpiredTime: boolean;
};

type RawIndexInfo = {
  name?: string;
  key?: Record<string, unknown>;
  expireAfterSeconds?: unknown;
  hidden?: unknown;
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
 * 识别 FastGPT 历史上按整小时配置的 `createdAt_1` TTL 索引（排除隐藏或非整小时客户索引）。
 */
const isKnownLegacyCreatedAtTtlSeconds = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 2_147_483_647 &&
  value % 3600 === 0;

const listLogCollectionIndexesSafe = async (): Promise<RawIndexInfo[]> => {
  try {
    return (await MongoLLMRequestRecord.collection.indexes()) as RawIndexInfo[];
  } catch (error) {
    if (isMongoErrorCode(error, [26])) {
      return [];
    }
    throw error;
  }
};

/** 查询当前集合最大 `_id`，作为断点续跑扫描上界。 */
export const findLatestLLMRequestRecordId = async (): Promise<string | null> => {
  const last = await MongoLLMRequestRecord.collection.findOne(
    {},
    { projection: { _id: 1 }, sort: { _id: -1 } }
  );
  return last ? String(last._id) : null;
};

/** 按 `_id` 游标读取一批历史追踪记录的最小投影。 */
export const listLLMRequestRecordBatch = async ({
  endId,
  lastId,
  limit
}: {
  endId: string;
  lastId: string | null;
  limit: number;
}): Promise<LLMRequestRecordMigrationItem[]> => {
  const docs = await MongoLLMRequestRecord.collection
    .find(
      {
        _id: {
          $lte: new Types.ObjectId(endId),
          ...(lastId ? { $gt: new Types.ObjectId(lastId) } : {})
        }
      },
      { projection: { _id: 1, createdAt: 1, expiredTime: 1 } }
    )
    .sort({ _id: 1 })
    .limit(limit)
    .toArray();

  return docs.map((doc) => ({
    id: String(doc._id),
    idTimestamp: doc._id.getTimestamp(),
    createdAt: isValidDate(doc.createdAt) ? doc.createdAt : undefined,
    hasValidExpiredTime: isValidDate(doc.expiredTime)
  }));
};

/**
 * 幂等为缺失合法 `expiredTime` 的历史记录补齐 `expiredTime`。
 * 保留 `createdAt` 字段不删除，确保 v4.17.x 混跑与回滚读取链路不中断。
 */
export const backfillLLMRequestRecordBatch = async ({
  items,
  retentionHours
}: {
  items: readonly LLMRequestRecordMigrationItem[];
  retentionHours: number;
}): Promise<{ backfilledCount: number }> => {
  const operations = items
    .filter((item) => !item.hasValidExpiredTime)
    .map((item) => {
      const baseTime = item.createdAt ?? item.idTimestamp;
      const expiredTime = getLLMRequestRecordExpiredTime(baseTime, retentionHours);
      return {
        updateOne: {
          filter: {
            _id: new Types.ObjectId(item.id),
            expiredTime: { $not: { $type: 'date' } }
          },
          update: {
            $set: { expiredTime }
          }
        }
      };
    });

  if (operations.length === 0) {
    return { backfilledCount: 0 };
  }

  const result = await MongoLLMRequestRecord.collection.bulkWrite(operations, { ordered: false });
  return { backfilledCount: result.modifiedCount };
};

/**
 * 全表扫描仍缺少合法 `Date` 类型 `expiredTime` 的记录 ID（不限 `endId` 上界），
 * 防止旧版本节点在混跑期间继续写入无 `expiredTime` 记录后误删旧 TTL 索引。
 */
export const findMissingExpiredTimeRecordIds = async (limit: number): Promise<string[]> => {
  const missingDocs = await MongoLLMRequestRecord.collection
    .find({ expiredTime: { $not: { $type: 'date' } } }, { projection: { _id: 1 } })
    .sort({ _id: 1 })
    .limit(limit)
    .toArray();

  return missingDocs.map((doc) => String(doc._id));
};

/**
 * 幂等补建新的 `expiredTime` 固定 TTL 索引，并通过 DAL `hasMatchingMongoIndex`
 * 校验索引已提交、非隐藏且可供查询规划器使用。
 */
export const ensureExpiredTimeTtlIndexReady = async (): Promise<boolean> => {
  const ready = await hasMatchingMongoIndex({
    client: connectionLogMongo,
    collectionName: LLMRequestRecordCollectionName,
    key: { expiredTime: 1 },
    options: { expireAfterSeconds: 0 }
  });
  if (ready) {
    return true;
  }

  await MongoLLMRequestRecord.collection.createIndex(
    { expiredTime: 1 },
    { name: LLMRequestRecordExpiredTimeIndexName, expireAfterSeconds: 0 }
  );

  return hasMatchingMongoIndex({
    client: connectionLogMongo,
    collectionName: LLMRequestRecordCollectionName,
    key: { expiredTime: 1 },
    options: { expireAfterSeconds: 0 }
  });
};

export type LegacyIndexCleanupOutcome =
  | 'dropped'
  | 'missing'
  | 'skipped_mismatch'
  | 'deferred_disabled';

/**
 * 复用 DAL `dropManagedMongoIndexIfExists` 按精确签名清理历史 `createdAt_1` TTL 索引：
 * - 隐藏索引或非整小时 TTL/附加选项不符时保守跳过，避免误删客户 DBA 自建索引；
 * - `apply=false`（`MONGO_DEPRECATE_INDEX=false`）时不执行删除并返回 `deferred_disabled`。
 */
export const cleanupLegacyCreatedAtTtlIndex = async ({
  apply
}: {
  apply: boolean;
}): Promise<{ status: LegacyIndexCleanupOutcome; reason?: string }> => {
  const indexes = await listLogCollectionIndexesSafe();
  const live = indexes.find((index) => index.name === LEGACY_LLM_RECORD_TTL_INDEX_NAME);
  if (!live) {
    return { status: 'missing' };
  }
  if (live.hidden === true || !isKnownLegacyCreatedAtTtlSeconds(live.expireAfterSeconds)) {
    return {
      status: 'skipped_mismatch',
      reason:
        live.hidden === true
          ? 'live createdAt_1 index is hidden'
          : 'live createdAt_1 expireAfterSeconds does not match known FastGPT hourly TTL'
    };
  }

  const outcome = await dropManagedMongoIndexIfExists({
    client: connectionLogMongo,
    collectionName: LLMRequestRecordCollectionName,
    indexName: LEGACY_LLM_RECORD_TTL_INDEX_NAME,
    expectedKey: { createdAt: 1 },
    expectedOptions: { expireAfterSeconds: live.expireAfterSeconds },
    apply
  });

  if (outcome.status === 'dropped' && !apply) {
    return { status: 'deferred_disabled' };
  }
  return { status: outcome.status, reason: outcome.reason };
};
