import { addSeconds } from 'date-fns';
import { hasMatchingMongoIndex } from '@fastgpt/dal/db/mongo/indexSync';
import { connectionLogMongo, Types } from '@fastgpt/service/common/mongo';
import {
  LLMRequestRecordCollectionName,
  LLMRequestRecordExpiredTimeIndexName,
  MongoLLMRequestRecord
} from '@fastgpt/service/core/ai/record/schema';

export type LLMRequestRecordMigrationItem = {
  id: string;
  idTimestamp: Date;
  createdAt?: Date;
  hasValidExpiredTime: boolean;
};

const isValidDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

const toMigrationItem = (doc: {
  _id: Types.ObjectId;
  createdAt?: unknown;
  expiredTime?: unknown;
}): LLMRequestRecordMigrationItem => ({
  id: String(doc._id),
  idTimestamp: doc._id.getTimestamp(),
  createdAt: isValidDate(doc.createdAt) ? doc.createdAt : undefined,
  hasValidExpiredTime: isValidDate(doc.expiredTime)
});

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

  return docs.map(toMigrationItem);
};

/** 按指定 `_id` 列表读取历史追踪记录，用于重试阶段优先补齐上次失败明细中的漏网记录。 */
export const listLLMRequestRecordsByIds = async (
  ids: readonly string[]
): Promise<LLMRequestRecordMigrationItem[]> => {
  if (ids.length === 0) {
    return [];
  }

  const docs = await MongoLLMRequestRecord.collection
    .find(
      { _id: { $in: ids.map((id) => new Types.ObjectId(id)) } },
      { projection: { _id: 1, createdAt: 1, expiredTime: 1 } }
    )
    .toArray();

  return docs.map(toMigrationItem);
};

/**
 * 幂等为缺失合法 `expiredTime` 的历史记录补齐 `expiredTime`。
 * 按 `ttlSeconds`（优先取现网旧 `createdAt_1` 的有效过期秒数）计算，保证存量记录维持原有期限；
 * 保留 `createdAt` 字段不删除，确保 v4.17.x 混跑与回滚读取链路不中断。
 */
export const backfillLLMRequestRecordBatch = async ({
  items,
  ttlSeconds
}: {
  items: readonly LLMRequestRecordMigrationItem[];
  ttlSeconds: number;
}): Promise<{ backfilledCount: number }> => {
  const operations = items
    .filter((item) => !item.hasValidExpiredTime)
    .map((item) => {
      const baseTime = item.createdAt ?? item.idTimestamp;
      const expiredTime = addSeconds(baseTime, ttlSeconds);
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
 * 覆盖旧版本节点在混跑期间写入于游标之前（同秒乱序 ObjectId）或上界之后的漏网记录。
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
