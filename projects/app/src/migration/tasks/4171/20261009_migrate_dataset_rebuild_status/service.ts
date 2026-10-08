import { connectionMongo, Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { BLOCKED_LOCK_TIME } from '@fastgpt/service/core/dataset/training/query';

const rebuildTrainingMatch = {
  // 旧重建可能仍处于增强/chunk 阶段；只有正式 data 才转换状态，预落库数据保持 indexing/error。
  mode: { $in: ['rebuild', 'chunk', 'auto', 'image', 'imageParse'] },
  dataId: { $ne: null }
};
const legacyIndexedMatch = {
  $or: [
    { indexStatus: { $exists: false } },
    { indexStatus: { $in: ['indexed', 'waitingRebuild'] } }
  ]
};

/** 通过原生集合保留对已从 Schema 删除的 rebuilding 字段的读取能力。 */
const getDb = () => {
  const db = connectionMongo.connection.db;
  if (!db) throw new Error('MongoDB connection is unavailable');
  return db;
};

/** 源字段与训练分别使用 _id 游标；固定上界，避免持续写入导致迁移无限运行。 */
export const getRebuildStatusEndId = async (stage: 'datas' | 'trainings') => {
  const last = await getDb()
    .collection(stage === 'datas' ? 'dataset_datas' : 'dataset_trainings')
    .findOne(stage === 'datas' ? { rebuilding: { $exists: true } } : rebuildTrainingMatch, {
      projection: { _id: 1 },
      sort: { _id: -1 }
    });
  return last ? String(last._id) : null;
};

/** 每批只读取有限 ID；业务转换时在事务内重新检查权威数据，防止覆盖已完成的 worker 结果。 */
export const readRebuildStatusBatch = ({
  stage,
  lastId,
  endId,
  limit
}: {
  stage: 'datas' | 'trainings';
  lastId: string | null;
  endId: string;
  limit: number;
}) =>
  getDb()
    .collection(stage === 'datas' ? 'dataset_datas' : 'dataset_trainings')
    .find(
      {
        ...(stage === 'datas' ? { rebuilding: { $exists: true } } : rebuildTrainingMatch),
        _id: {
          $lte: new Types.ObjectId(endId),
          ...(lastId ? { $gt: new Types.ObjectId(lastId) } : {})
        }
      },
      { projection: { _id: 1 } }
    )
    .sort({ _id: 1 })
    .limit(limit)
    .toArray();

/**
 * 每批一个短事务。旧 true 表示待入队，false 只清理；已有新状态与初次索引状态不被覆盖。
 * 训练阶段按仍存在的任务恢复重建中/失败，保留正文、索引、账单、重试次数和租约。
 * 业务提交后、checkpoint 前崩溃可以重放；已转换的数据不再满足条件。
 */
export const migrateRebuildStatusBatch = async ({
  stage,
  ids
}: {
  stage: 'datas' | 'trainings';
  ids: Types.ObjectId[];
}) => {
  const db = getDb();
  await mongoSessionRun(async (session) => {
    const datas = db.collection('dataset_datas');
    if (stage === 'datas') {
      const batch = await datas
        .find({ _id: { $in: ids }, rebuilding: { $exists: true } }, { session })
        .toArray();
      for (const data of batch) {
        if (typeof data.rebuilding !== 'boolean')
          throw new Error(`Invalid rebuilding field on dataset data ${data._id}`);
        const waiting =
          data.rebuilding && (data.indexStatus == null || data.indexStatus === 'indexed');
        await datas.updateOne(
          { _id: data._id, rebuilding: data.rebuilding },
          {
            ...(waiting && { $set: { indexStatus: DatasetDataIndexStatusEnum.waitingRebuild } }),
            $unset: { rebuilding: '' }
          },
          { session }
        );
      }
      return;
    }
    const trainings = await db
      .collection('dataset_trainings')
      .find({ _id: { $in: ids }, ...rebuildTrainingMatch }, { session })
      .toArray();
    for (const task of trainings) {
      const failed = (task.retryCount ?? 0) <= 0 || task.lockTime >= BLOCKED_LOCK_TIME;
      await datas.updateOne(
        {
          _id: task.dataId,
          teamId: task.teamId,
          datasetId: task.datasetId,
          collectionId: task.collectionId,
          ...legacyIndexedMatch
        },
        {
          $set: {
            indexStatus: failed
              ? DatasetDataIndexStatusEnum.rebuildError
              : DatasetDataIndexStatusEnum.rebuilding,
            ...(failed && { indexErrorMsg: task.errorMsg || 'Rebuild training stopped' })
          },
          ...(!failed && { $unset: { indexErrorMsg: '' } })
        },
        { session }
      );
    }
  });
};

/** 完成条件来自业务集合；不能仅根据游标到达末尾判断成功。 */
export const countRemainingRebuildStatuses = async () => {
  const db = getDb();
  const legacyFields = await db
    .collection('dataset_datas')
    .countDocuments({ rebuilding: { $exists: true } });
  const [legacyTraining] = await db
    .collection('dataset_trainings')
    .aggregate([
      { $match: rebuildTrainingMatch },
      { $lookup: { from: 'dataset_datas', localField: 'dataId', foreignField: '_id', as: 'data' } },
      { $unwind: '$data' },
      {
        $match: {
          $or: [
            { 'data.indexStatus': { $exists: false } },
            { 'data.indexStatus': { $in: ['indexed', 'waitingRebuild'] } }
          ],
          $expr: {
            $and: [
              { $eq: ['$teamId', '$data.teamId'] },
              { $eq: ['$datasetId', '$data.datasetId'] },
              { $eq: ['$collectionId', '$data.collectionId'] }
            ]
          }
        }
      },
      { $count: 'count' }
    ])
    .toArray();
  return legacyFields + (legacyTraining?.count ?? 0);
};
