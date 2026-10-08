import { connectionMongo, Types, type ClientSession } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getTrainingTaskReadyUpdate } from '@fastgpt/service/core/dataset/training/utils';
import { serviceEnv } from '@fastgpt/service/env';
import { TRAINING_LEASE_TIMEOUT_MS } from '@fastgpt/global/core/dataset/training/constant';

/** 只迁移已弃用的 chunk 及没有预落库数据的旧增强任务。 */
const legacyTaskFilter = {
  $or: [{ mode: 'chunk' }, { mode: { $in: ['auto', 'image', 'imageParse'] }, dataId: null }]
};
const blockedLockTime = new Date('2050-01-01');

/** 可修复的单条源数据问题；数据库和基础设施异常仍直接终止当前批次。 */
export class LegacyTrainingValidationError extends Error {}

/** 原生集合读取历史结构，避免新 Schema 丢失旧字段。 */
const getDb = () => {
  const db = connectionMongo.connection.db;
  if (!db) throw new Error('MongoDB connection is unavailable');
  return db;
};

/** 冻结本轮扫描上界，旧节点持续写入时也能有界结束并在完成校验中报错。 */
export const getLegacyTrainingEndId = async () => {
  const last = await getDb()
    .collection('dataset_trainings')
    .findOne(legacyTaskFilter, {
      projection: { _id: 1 },
      sort: { _id: -1 }
    });
  return last ? String(last._id) : null;
};

/** 使用稳定 _id 游标读取有限批次；已转换的任务会自然退出源集合。 */
export const readLegacyTrainingBatch = ({
  lastId,
  endId,
  limit
}: {
  lastId: string | null;
  endId: string;
  limit: number;
}) =>
  getDb()
    .collection('dataset_trainings')
    .find(
      {
        ...legacyTaskFilter,
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

/** 可统计冻结窗口内的待迁移量；无窗口参数时执行全局完成校验。 */
export const countLegacyTrainings = (endId?: string) =>
  getDb()
    .collection('dataset_trainings')
    .countDocuments({
      ...legacyTaskFilter,
      ...(endId ? { _id: { $lte: new Types.ObjectId(endId) } } : {})
    });

/**
 * 每条任务在事务内重读、校验、预落库并原地改阶段；任务与 data/图片 TTL 同时提交。
 * 复用训练 _id 保证数据 ID 确定，保留账单和索引草稿；转换成功时恢复可领取状态。
 * 重放时已转换任务直接跳过，不会重置 worker 已经领取或处理过的任务。
 * 活跃 worker 的任务不迁移，管理员应在所有旧 App/Pro 升级且租约过期后手动执行。
 */
export const migrateLegacyTraining = async (_id: Types.ObjectId, session?: ClientSession) => {
  const db = getDb();
  const trainings = db.collection('dataset_trainings');
  const datas = db.collection('dataset_datas');
  const datasets = db.collection('datasets');
  const collections = db.collection('dataset_collections');
  const privateBucket = serviceEnv.STORAGE_PRIVATE_BUCKET;
  const migrate = async (session: ClientSession) => {
    const task = await trainings.findOne({ _id, ...legacyTaskFilter }, { session });
    if (!task) return;
    const fail = (reason: string): never => {
      throw new LegacyTrainingValidationError(reason);
    };
    if (
      task.lockTime instanceof Date &&
      task.lockTime >= new Date(Date.now() - TRAINING_LEASE_TIMEOUT_MS) &&
      task.lockTime < blockedLockTime
    ) {
      fail('active lease; stop old workers and wait for the lease to expire before retrying');
    }
    if (
      !task.teamId ||
      !task.tmbId ||
      !task.datasetId ||
      !task.collectionId ||
      !task.billId ||
      !(await datasets.findOne({ _id: task.datasetId, teamId: task.teamId }, { session })) ||
      !(await collections.findOne(
        { _id: task.collectionId, datasetId: task.datasetId, teamId: task.teamId },
        { session }
      ))
    ) {
      fail('missing or mismatched ownership; source task retained for repair');
    }

    const scope = {
      teamId: task.teamId,
      datasetId: task.datasetId,
      collectionId: task.collectionId
    };
    const data = task.dataId
      ? await datas.findOne({ _id: task.dataId, ...scope }, { session })
      : null;
    if (task.dataId && !data) fail('referenced data missing or mismatched; source task retained');
    if (data?.indexStatus != null && !['indexing', 'error', 'indexed'].includes(data.indexStatus)) {
      fail('unknown indexStatus; source task retained');
    }
    const isNew = !task.dataId;
    const mode =
      task.mode === 'chunk'
        ? !data || ['indexing', 'error'].includes(data.indexStatus)
          ? 'index'
          : 'rebuild'
        : task.mode;
    // 复用任务 _id 作为新数据 _id，跨集合合法；碰撞时拒绝覆盖任何既有业务数据。
    const dataId = task.dataId ?? task._id;
    if (isNew) {
      // 历史原始记录不经过当前 Schema，先校验类型，避免单条脏数据使整批任务提前中断。
      for (const field of ['q', 'a', 'imageId'] as const) {
        if (task[field] != null && typeof task[field] !== 'string') {
          fail(`invalid ${field} type; source task retained for repair`);
        }
      }
      if (!(task.q?.trim() || task.a?.trim() || task.imageId)) fail('empty legacy content');
      if (await datas.findOne({ _id: dataId }, { session })) fail('data id collision');
      if (task.imageId && !privateBucket) fail('STORAGE_PRIVATE_BUCKET is required for image TTL');
    }

    if (isNew) {
      await datas.insertOne(
        {
          _id: dataId,
          ...scope,
          tmbId: task.tmbId,
          q: task.q ?? '',
          a: task.a ?? '',
          ...(task.imageId && { imageId: task.imageId }),
          ...(task.dataMetadata && { metadata: task.dataMetadata }),
          chunkIndex: task.chunkIndex ?? 0,
          indexes: [],
          updateTime: new Date(),
          indexStatus: 'indexing'
        },
        { session }
      );
      if (task.imageId) {
        await db
          .collection('s3_ttls')
          .deleteMany({ bucketName: privateBucket, minioKey: task.imageId }, { session });
      }
    } else if (mode === 'index' && data?.indexStatus === 'error') {
      await datas.updateOne(
        { _id: dataId, ...scope },
        { $set: { indexStatus: 'indexing' }, $unset: { indexErrorMsg: '' } },
        { session }
      );
    }
    // 补齐数据和激活必须一起提交，避免 worker 领取到尚未关联 data 的半成品。
    // 复用手动重试的恢复规则，保留原任务 TTL；下一阶段按自己的生命周期处理过期策略。
    const readyUpdate = getTrainingTaskReadyUpdate();
    const result = await trainings.updateOne(
      { _id, mode: task.mode, lockTime: task.lockTime ?? null },
      { ...readyUpdate, $set: { ...readyUpdate.$set, mode, dataId } },
      { session }
    );
    if (result.matchedCount !== 1) fail('task changed while migrating');
    return { mode, isNew };
  };
  return session ? migrate(session) : mongoSessionRun(migrate);
};
