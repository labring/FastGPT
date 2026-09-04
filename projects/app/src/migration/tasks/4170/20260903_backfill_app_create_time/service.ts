import { MongoApp } from '@fastgpt/service/core/app/schema';
import { Types } from '@fastgpt/service/common/mongo';

export type AppCreateTimeRecord = {
  _id: Types.ObjectId;
  createTime?: Date | null;
};

const missingCreateTimeQuery = {
  $or: [{ createTime: { $exists: false } }, { createTime: null }]
};

/** 从 App ObjectId 提取确定的创建时间；非法 ID 不猜测时间。 */
export const getAppCreateTimeFromObjectId = (id: unknown): Date | undefined => {
  try {
    if (id instanceof Types.ObjectId) return id.getTimestamp();

    const idString = String(id ?? '');
    if (!Types.ObjectId.isValid(idString) || String(new Types.ObjectId(idString)) !== idString) {
      return undefined;
    }
    return new Types.ObjectId(idString).getTimestamp();
  } catch {
    return undefined;
  }
};

/** 固定本轮快照上界，避免持续新增的 App 让主扫描无法结束。 */
export const initializeAppCreateTimeSnapshot = async () => {
  const lastApp = await MongoApp.collection
    .find({ _id: { $type: 'objectId' } }, { projection: { _id: 1 } })
    .sort({ _id: -1 })
    .limit(1)
    .next();
  const endId = getAppCreateTimeFromObjectId(lastApp?._id) ? String(lastApp?._id) : null;
  const total = endId
    ? await MongoApp.collection.countDocuments({
        _id: { $type: 'objectId', $lte: new Types.ObjectId(endId) }
      })
    : 0;

  return { endId, total };
};

/** 按不可变 ObjectId 游标读取固定快照中的下一批 App。 */
export const readAppCreateTimeBatch = async ({
  endId,
  lastId,
  limit
}: {
  endId: string;
  lastId: string | null;
  limit: number;
}): Promise<AppCreateTimeRecord[]> => {
  const idRange: { $gt?: Types.ObjectId; $lte: Types.ObjectId } = {
    $lte: new Types.ObjectId(endId)
  };
  if (lastId) idRange.$gt = new Types.ObjectId(lastId);

  return MongoApp.collection
    .find({ _id: idRange }, { projection: { _id: 1, createTime: 1 } })
    .sort({ _id: 1 })
    .limit(limit)
    .toArray();
};

/** 读取主快照结束后仍缺少 createTime 的 ObjectId 记录。 */
export const readAppsMissingCreateTime = async ({
  lastId,
  limit
}: {
  lastId: string | null;
  limit: number;
}): Promise<AppCreateTimeRecord[]> =>
  MongoApp.collection
    .find(
      {
        ...missingCreateTimeQuery,
        _id: {
          $type: 'objectId',
          ...(lastId ? { $gt: new Types.ObjectId(lastId) } : {})
        }
      },
      { projection: { _id: 1, createTime: 1 } }
    )
    .sort({ _id: 1 })
    .limit(limit)
    .toArray();

/**
 * 用 compare-and-set 回填单条记录。已有值保持不变，并发请求先写入时也视为成功。
 * 返回字符串表示仍需管理员处理的原始错误。
 */
export const backfillAppCreateTimeRecord = async (
  record: AppCreateTimeRecord
): Promise<string | undefined> => {
  if (record.createTime !== undefined && record.createTime !== null) return;

  const createTime = getAppCreateTimeFromObjectId(record._id);
  if (!createTime) return 'App _id is not a valid ObjectId';

  try {
    const result = await MongoApp.collection.updateOne(
      {
        _id: record._id,
        ...missingCreateTimeQuery
      },
      { $set: { createTime } }
    );
    if (result.matchedCount === 1) return;

    const current = await MongoApp.collection.findOne(
      { _id: record._id },
      { projection: { createTime: 1 } }
    );
    if (!current || (current.createTime !== undefined && current.createTime !== null)) return;
    return 'App changed concurrently and the compare-and-set write failed';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

/** 成功前确认所有 App 都已有 createTime，不能只依赖脚本未抛错。 */
export const countAppsMissingCreateTime = () =>
  MongoApp.collection.countDocuments({
    ...missingCreateTimeQuery,
    _id: { $type: 'objectId' }
  });

/** 非 ObjectId 无法可靠推导时间，只统计并保留原记录供管理员排查。 */
export const countAppsWithInvalidIdMissingCreateTime = () =>
  MongoApp.collection.countDocuments({
    ...missingCreateTimeQuery,
    _id: { $not: { $type: 'objectId' } }
  });
