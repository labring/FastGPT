import { connectionMongo, Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { BLOCKED_LOCK_TIME } from '@fastgpt/service/core/dataset/training/query';

// 兼容本轮开发期间已落库的旧状态名；正常业务只使用 rebuildIndex* 状态。
const legacyDataMatch = {
  $or: [
    { rebuilding: { $exists: true } },
    { indexStatus: { $in: ['waitingRebuild', 'rebuilding', 'rebuildError'] } }
  ]
};

const rebuildTrainingMatch = {
  $or: [
    { mode: 'rebuild' },
    { synonymVersion: { $exists: true } },
    // 旧增强阶段只恢复正式 data 的状态，预落库数据保持 indexing/error。
    { mode: { $in: ['chunk', 'auto', 'image', 'imageParse'] }, dataId: { $ne: null } }
  ]
};
const legacyIndexedMatch = {
  $or: [
    { indexStatus: { $exists: false } },
    { indexStatus: { $in: ['indexed', 'rebuildIndexPending'] } }
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
    .findOne(stage === 'datas' ? legacyDataMatch : rebuildTrainingMatch, {
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
        ...(stage === 'datas' ? legacyDataMatch : rebuildTrainingMatch),
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
 * 每批一个短事务。旧 true 表示待入队，false 只清理；旧枚举值等义更名。
 * 已有 rebuildIndex* 状态与初次索引状态不被覆盖。
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
        .find({ _id: { $in: ids }, ...legacyDataMatch }, { session })
        .toArray();
      for (const data of batch) {
        if ('rebuilding' in data && typeof data.rebuilding !== 'boolean')
          throw new Error(`Invalid rebuilding field on dataset data ${data._id}`);
        const indexStatus = (() => {
          switch (data.indexStatus) {
            case 'waitingRebuild':
              return DatasetDataIndexStatusEnum.rebuildIndexPending;
            case 'rebuilding':
              return DatasetDataIndexStatusEnum.rebuildIndexRunning;
            case 'rebuildError':
              return DatasetDataIndexStatusEnum.rebuildIndexFailed;
          }
          if (data.rebuilding && (data.indexStatus == null || data.indexStatus === 'indexed')) {
            return DatasetDataIndexStatusEnum.rebuildIndexPending;
          }
        })();
        await datas.updateOne(
          { _id: data._id, ...legacyDataMatch },
          {
            ...(indexStatus && { $set: { indexStatus } }),
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
      const isSynonym =
        typeof task.synonymVersion === 'number' &&
        task.synonymVersion > 0 &&
        ['rebuild', TrainingModeEnum.rebuildIndex, TrainingModeEnum.rebuildSynonym].includes(
          task.mode
        );
      const config = isSynonym
        ? await db
            .collection('dataset_synonyms')
            .findOne(
              { teamId: task.teamId, datasetId: task.datasetId },
              { session, projection: { version: 1 } }
            )
        : undefined;
      const version = config?.version ?? task.synonymVersion;
      const failed = (task.retryCount ?? 0) <= 0 || task.lockTime >= BLOCKED_LOCK_TIME;
      const nextMode = isSynonym ? TrainingModeEnum.rebuildSynonym : TrainingModeEnum.rebuildIndex;
      await datas.updateOne(
        {
          _id: task.dataId,
          teamId: task.teamId,
          datasetId: task.datasetId,
          collectionId: task.collectionId,
          ...(isSynonym
            ? {
                indexStatus: {
                  $in: [
                    'indexed',
                    'rebuildIndexPending',
                    'rebuildIndexRunning',
                    'rebuildIndexFailed',
                    'rebuildSynonymPending'
                  ]
                }
              }
            : legacyIndexedMatch)
        },
        {
          $set: {
            indexStatus: isSynonym
              ? failed
                ? DatasetDataIndexStatusEnum.rebuildSynonymFailed
                : DatasetDataIndexStatusEnum.rebuildSynonymRunning
              : failed
                ? DatasetDataIndexStatusEnum.rebuildIndexFailed
                : DatasetDataIndexStatusEnum.rebuildIndexRunning,
            ...(isSynonym && { synonymRebuildingVersion: version }),
            ...(failed && { indexErrorMsg: task.errorMsg || 'Rebuild training stopped' })
          },
          ...(!failed && { $unset: { indexErrorMsg: '' } })
        },
        { session }
      );
      await db.collection('dataset_trainings').updateOne(
        { _id: task._id },
        {
          ...((task.mode === 'rebuild' || isSynonym) && {
            $set: { mode: nextMode, ...(isSynonym && { expireAt: null }) }
          }),
          $unset: { synonymVersion: '' }
        },
        { session }
      );
    }
  });
};

/** 完成条件来自业务集合；不能仅根据游标到达末尾判断成功。 */
export const countRemainingRebuildStatuses = async () => {
  const db = getDb();
  const legacyFields = await db.collection('dataset_datas').countDocuments(legacyDataMatch);
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
            { 'data.indexStatus': { $in: ['indexed', 'rebuildIndexPending'] } }
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
  const legacyTasks = await db
    .collection('dataset_trainings')
    .countDocuments({ $or: [{ mode: 'rebuild' }, { synonymVersion: { $exists: true } }] });
  return legacyFields + (legacyTraining?.count ?? 0) + legacyTasks;
};
