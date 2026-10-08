import { pathToFileURL } from 'node:url';
import mongoose, { type Connection, type ClientSession } from 'mongoose';
import { TRAINING_LEASE_TIMEOUT_MS } from '@fastgpt/global/core/dataset/training/constant';

/** 仅迁移旧 chunk，以及尚未预落库的旧增强任务；QA/parse 仍由各自阶段创建叶子数据。 */
const legacyTaskFilter = {
  $or: [{ mode: 'chunk' }, { mode: { $in: ['auto', 'image', 'imageParse'] }, dataId: null }]
};
const blockedLockTime = new Date('2050-01-01');

type MigrationOptions = {
  connection: Connection;
  dryRun?: boolean;
  batchSize?: number;
  privateBucket?: string;
};

/**
 * 升级全部 App/Pro 节点并停止旧 worker 后执行的独立迁移，不注册为滚动升级期间的启动任务。
 * 每条任务以事务原地改阶段：无 dataId 时先预落库，有 dataId 时按数据状态进入 index/rebuild。
 * 业务正文、索引草稿、账单、重试次数、错误和 TTL 保留；不生成向量，也不重新计费。
 * 按 _id 分批扫描，已提交任务自然退出源集合，失败后全量重跑不会重复建 data。
 */
export const migrateChunkTraining = async ({
  connection,
  dryRun = true,
  batchSize = 100,
  privateBucket
}: MigrationOptions) => {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new Error('batchSize must be an integer between 1 and 1000');
  }
  const db = connection.db;
  if (!db) throw new Error('MongoDB connection is unavailable');
  const trainings = db.collection('dataset_trainings');
  const datas = db.collection('dataset_datas');
  const collections = db.collection('dataset_collections');
  const datasets = db.collection('datasets');
  const stats = { scanned: 0, index: 0, rebuild: 0, preCreated: 0, enhancement: 0 };

  /** 事务内重读源任务，避免覆盖其他迁移进程或 worker 的提交；活跃租约必须保留。 */
  const migrateOne = async (_id: mongoose.Types.ObjectId, session?: ClientSession) => {
    const task = await trainings.findOne({ _id, ...legacyTaskFilter }, { session });
    if (!task) return;
    const fail = (reason: string): never => {
      throw new Error(`Training ${String(_id)}: ${reason}`);
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
    if (data?.indexStatus && !['indexing', 'error', 'indexed'].includes(data.indexStatus)) {
      fail('unknown indexStatus; source task retained');
    }
    const isNew = !task.dataId;
    const mode =
      task.mode === 'chunk'
        ? !data || ['indexing', 'error'].includes(data.indexStatus)
          ? 'index'
          : 'rebuild'
        : task.mode;
    const indexFailed = mode === 'index' && task.retryCount <= 0 && !!task.errorMsg?.trim();
    // 复用任务 _id 作为新数据 _id，跨集合合法；碰撞时拒绝覆盖任何既有业务数据。
    const dataId = task.dataId ?? task._id;
    if (isNew) {
      if (!(task.q?.trim() || task.a?.trim() || task.imageId)) fail('empty legacy content');
      if (await datas.findOne({ _id: dataId }, { session })) fail('data id collision');
      if (task.imageId && !privateBucket) fail('STORAGE_PRIVATE_BUCKET is required for image TTL');
    }

    if (!dryRun) {
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
            indexStatus: indexFailed ? 'error' : 'indexing',
            ...(indexFailed && { indexErrorMsg: task.errorMsg })
          },
          { session }
        );
        if (task.imageId) {
          await db
            .collection('s3_ttls')
            .deleteMany({ bucketName: privateBucket, minioKey: task.imageId }, { session });
        }
      } else if (indexFailed) {
        await datas.updateOne(
          { _id: dataId, ...scope },
          { $set: { indexStatus: 'error', indexErrorMsg: task.errorMsg } },
          { session }
        );
      }
      const result = await trainings.updateOne(
        { _id, mode: task.mode, lockTime: task.lockTime ?? null },
        { $set: { mode, dataId } },
        { session }
      );
      if (result.matchedCount !== 1) fail('task changed while migrating');
    }
    return { mode, isNew };
  };

  let afterId: mongoose.Types.ObjectId | undefined;
  const session = dryRun ? undefined : await connection.startSession();
  try {
    while (true) {
      const batch = await trainings
        .find(
          {
            ...legacyTaskFilter,
            ...(afterId ? { _id: { $gt: afterId } } : {})
          },
          { projection: { _id: 1 } }
        )
        .sort({ _id: 1 })
        .limit(batchSize)
        .toArray();
      if (!batch.length) break;
      for (const task of batch) {
        const result = session
          ? await session.withTransaction(() => migrateOne(task._id, session))
          : await migrateOne(task._id);
        if (result) {
          stats.scanned++;
          if (result.isNew) stats.preCreated++;
          if (result.mode === 'index') stats.index++;
          else if (result.mode === 'rebuild') stats.rebuild++;
          else stats.enhancement++;
        }
      }
      afterId = batch.at(-1)!._id;
    }
    const remaining = await trainings.countDocuments(legacyTaskFilter);
    if (!dryRun && remaining) {
      throw new Error(`${remaining} legacy training tasks remain; stop legacy producers and retry`);
    }
    return { dryRun, ...stats, remaining };
  } finally {
    await session?.endSession();
  }
};

/** CLI 默认只读预览；执行前须完成所有旧 App/Pro 节点升级，迁移不直接启动任何 worker。 */
const main = async () => {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  if (args.includes('--help')) {
    console.log(
      'MONGODB_URI=<uri> STORAGE_PRIVATE_BUCKET=<bucket> pnpm --filter @fastgpt/app migrate:chunk -- [--dry-run|--execute]\nStop training workers, upgrade all App/Pro nodes, migrate, then restart workers. Default: dry-run. Re-run safely after fixing reported task IDs.'
    );
    return;
  }
  if (args.some((arg) => !['--execute', '--dry-run'].includes(arg)) || args.length > 1) {
    throw new Error('Use --dry-run (default) or --execute');
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  const connection = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
  try {
    console.log(
      JSON.stringify(
        await migrateChunkTraining({
          connection,
          dryRun: !args.includes('--execute'),
          privateBucket: process.env.STORAGE_PRIVATE_BUCKET
        })
      )
    );
  } finally {
    await connection.close();
  }
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Training migration failed');
    process.exitCode = 1;
  });
}
