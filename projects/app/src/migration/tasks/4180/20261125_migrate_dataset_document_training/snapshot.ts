import z from 'zod';
import type { mongo } from 'mongoose';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { DatasetDataIndexStatusEnum as Status } from '@fastgpt/global/core/dataset/data/constants';
import { Types, connectionMongo, type ClientSession } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { DatasetColCollectionName } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetDataCollectionName } from '@fastgpt/service/core/dataset/data/schema';
import { systemMigrationBatchSize } from '@/migration/constants';

const taskSnapshotName = 'migration_20261125_dataset_training_tasks';
const dataSnapshotName = 'migration_20261125_dataset_training_data';

export const sourceStages = ['legacyTasks', 'remainingData'] as const;
export type SourceStage = (typeof sourceStages)[number];

const CursorSchema = ObjectIdSchema.nullable();
const BoundsSchema = z.object({
  endId: CursorSchema,
  total: z.int().nonnegative()
});
const CopyCheckpointSchema = BoundsSchema.extend({ copiedThrough: CursorSchema });
const ProcessingCheckpointSchema = BoundsSchema.extend({
  processedThrough: CursorSchema,
  processed: z.int().nonnegative()
});
export const CheckpointSchema = z.object({
  cutoverAt: z.iso.datetime(),
  sealed: z.boolean(),
  preflightDone: z.boolean(),
  legacyTasks: ProcessingCheckpointSchema.extend({ copiedThrough: CursorSchema }),
  remainingData: ProcessingCheckpointSchema.extend({
    indexStatus: CopyCheckpointSchema,
    rebuilding: CopyCheckpointSchema
  })
});
export type Checkpoint = z.infer<typeof CheckpointSchema>;
type CopyCheckpoint = z.infer<typeof CopyCheckpointSchema>;
type DataSource = 'indexStatus' | 'rebuilding';

export type Receipt =
  | { kind: 'deletedParent' | 'indexed' | 'duplicateParse' | 'rebuildSource' | 'coveredData' }
  | {
      kind: 'parse' | 'qa' | 'data';
      targetId: Types.ObjectId;
      fields: string[];
      digest: string;
    };

export type SnapshotRow = {
  _id: Types.ObjectId;
  source: mongo.Document;
  repair?: unknown;
  receipt?: Receipt;
};

const sharedRebuildStates = [
  Status.rebuildIndexPending,
  Status.rebuildIndexRunning,
  Status.rebuildSynonymPending,
  Status.rebuildSynonymRunning
];

// 无旧任务的存量 error 分块属于已取消/终态分块，不纳入快照扫描；有旧任务引用的 error 分块由 legacyTasks 阶段直接处理。
const legacyIndexStatuses = [
  Status.indexing,
  Status.rebuildIndexFailed,
  Status.rebuildSynonymFailed,
  'waitingRebuild',
  'rebuilding',
  'rebuildError',
  ...sharedRebuildStates
];

const dataProjection = {
  _id: 1,
  teamId: 1,
  datasetId: 1,
  collectionId: 1,
  tmbId: 1,
  indexStatus: 1,
  indexError: 1,
  indexErrorMsg: 1,
  rebuilding: 1,
  synonymVersion: 1,
  synonymRebuildingVersion: 1
};

/** 原生集合保留已从现行业务 Schema 删除的旧字段，并且不会为旧队列注册索引。 */
export const getMigrationDb = () => {
  const connection = connectionMongo.connection;
  const db = connection.db;
  if (!db) throw new Error('MongoDB connection is unavailable');
  return connection.getClient().db(db.databaseName, { readPreference: 'primary' });
};

export const getSnapshot = (stage: SourceStage) =>
  getMigrationDb().collection<SnapshotRow>(
    stage === 'legacyTasks' ? taskSnapshotName : dataSnapshotName
  );

/** 字符串键存放团队判定和迁入轮次，游标只读取使用 ObjectId 的源记录。 */
export const getSnapshotMetadata = <T extends { _id: string }>() =>
  getMigrationDb().collection<T>(taskSnapshotName);

/** 空库判定只读，已有新版文档轮次的共享重建阶段由业务链路接管。 */
export const hasLegacySources = async () => {
  if (
    await getMigrationDb()
      .collection('dataset_trainings')
      .findOne({}, { projection: { _id: 1 } })
  ) {
    return true;
  }
  return Boolean(
    (await readDataSource('indexStatus').limit(1).next()) ??
    (await readDataSource('rebuilding').limit(1).next())
  );
};

/** 在同一个主库快照中固定两份源的上界与总量，之后的 TTL 删除会在封存时表现为缺口。 */
export const getInitialCheckpoint = () =>
  mongoSessionRun(
    async (session): Promise<Checkpoint> => {
      const cutoverAt = new Date().toISOString();
      const legacyTasks = await getTaskBounds(session);
      const indexStatus = await getDataBounds('indexStatus', session);
      const rebuilding = await getDataBounds('rebuilding', session);
      return {
        cutoverAt,
        sealed: false,
        preflightDone: false,
        legacyTasks: { ...legacyTasks, processedThrough: null, processed: 0 },
        remainingData: {
          endId:
            (indexStatus.endId ?? '') > (rebuilding.endId ?? '')
              ? indexStatus.endId
              : rebuilding.endId,
          total: indexStatus.total + rebuilding.total,
          processedThrough: null,
          processed: 0,
          indexStatus,
          rebuilding
        }
      };
    },
    { readConcern: { level: 'snapshot' }, readPreference: 'primary' }
  );

/** 临时集合上的索引用于固定快照内按文档去重和按分块定位旧任务。 */
export const prepareSnapshotIndexes = async () => {
  await getSnapshot('legacyTasks').createIndexes([
    {
      key: { 'source.collectionId': 1, 'source.mode': 1, _id: -1 },
      name: 'fg_trainmig_parse'
    },
    { key: { 'source.dataId': 1, _id: -1 }, name: 'fg_trainmig_data' }
  ]);
};

export const copySnapshotBatch = async ({
  source,
  checkpoint: { endId, copiedThrough },
  assertActive
}: {
  source: 'legacyTasks' | DataSource;
  checkpoint: CopyCheckpoint;
  assertActive: () => Promise<void>;
}) => {
  if (!endId || endId === copiedThrough) return;
  const range = idRange(endId, copiedThrough);
  const cursor =
    source === 'legacyTasks'
      ? getMigrationDb().collection('dataset_trainings').find(range).sort({ _id: 1 })
      : readDataSource(source, { match: range, order: 1 });
  const rows = await cursor.limit(systemMigrationBatchSize).toArray();
  const last = rows.at(-1);
  if (!last) return;

  await assertActive();
  await getSnapshot(source === 'legacyTasks' ? 'legacyTasks' : 'remainingData').bulkWrite(
    rows.map((source) => {
      if (!(source._id instanceof Types.ObjectId))
        throw new Error('Legacy training source ID is invalid');
      return {
        updateOne: {
          filter: { _id: source._id },
          update: { $setOnInsert: { source } },
          upsert: true
        }
      };
    })
  );
  return String(last._id);
};

export const countSnapshot = (stage: SourceStage, endId: string | null) =>
  endId ? getSnapshot(stage).countDocuments(idRange(endId, null)) : Promise.resolve(0);

export const readSnapshotBatch = (
  stage: SourceStage,
  { endId, processedThrough }: Checkpoint[SourceStage]
) =>
  endId
    ? getSnapshot(stage)
        .find(idRange(endId, processedThrough))
        .sort({ _id: 1 })
        .limit(systemMigrationBatchSize)
        .toArray()
    : Promise.resolve([]);

export const streamSnapshot = (stage: SourceStage, endId: string) =>
  getSnapshot(stage)
    .find(idRange(endId, null))
    .sort({ _id: 1 })
    .batchSize(systemMigrationBatchSize);

const idRange = (endId: string, lastId: string | null) => ({
  _id: {
    $lte: new Types.ObjectId(endId),
    ...(lastId && { $gt: new Types.ObjectId(lastId) })
  }
});

type DataReadOptions = {
  match?: mongo.Filter<mongo.Document>;
  session?: ClientSession;
  order?: 1;
};

/** 4.17.0 写过 rebuilding 裸字段，它的旧索引可能已清理。独立扫描让状态查询使用现有索引。 */
const readDataSource = (source: DataSource, { match, session, order }: DataReadOptions = {}) => {
  const collection = getMigrationDb().collection(DatasetDataCollectionName);
  const sort = order ? [{ $sort: { _id: order } }] : [];
  const options = { session, allowDiskUse: true };
  if (source === 'rebuilding') {
    return collection.aggregate<mongo.Document>(
      [{ $match: { ...match, rebuilding: true } }, ...sort, { $project: dataProjection }],
      options
    );
  }
  return collection.aggregate<mongo.Document>(
    [
      {
        $match: { ...match, indexStatus: { $in: legacyIndexStatuses }, rebuilding: { $ne: true } }
      },
      ...sort,
      {
        $lookup: {
          from: DatasetColCollectionName,
          let: { collectionId: { $ifNull: ['$collectionId', null] } },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$collectionId'] } } },
            { $project: { training: 1 } }
          ],
          as: 'collection'
        }
      },
      {
        $match: {
          $or: [
            { indexStatus: { $nin: sharedRebuildStates } },
            { 'collection.training.usageId': { $not: /^[a-f0-9]{24}$/i } }
          ]
        }
      },
      { $project: dataProjection }
    ],
    options
  );
};

const getTaskBounds = async (session: ClientSession): Promise<CopyCheckpoint> => {
  const tasks = getMigrationDb().collection('dataset_trainings');
  // Mongo 范围比较按 BSON 类型匹配，先显式校验旧 ID，避免异常记录消失在 ObjectId 游标之外。
  if (
    await tasks.findOne(
      { _id: { $not: { $type: 'objectId' } } },
      { session, projection: { _id: 1 } }
    )
  ) {
    throw new Error(
      'Invalid source ID in legacyTasks. Review legacy records with non-ObjectId _id values.'
    );
  }
  const last = await tasks.findOne({}, { session, sort: { _id: -1 }, projection: { _id: 1 } });
  if (!last) return { endId: null, total: 0, copiedThrough: null };
  const endId = String(last._id);
  const total = await tasks.countDocuments(idRange(endId, null), { session });
  return { endId, total, copiedThrough: null };
};

/** 每种候选只遍历一次即可统计总量、上界和异常 ID。 */
const getDataBounds = async (
  source: DataSource,
  session: ClientSession
): Promise<CopyCheckpoint> => {
  const bounds = await readDataSource(source, { session })
    .group<{ endId: unknown; total: number; invalidIds: number }>({
      _id: null,
      endId: { $max: '$_id' },
      total: { $sum: 1 },
      invalidIds: { $sum: { $cond: [{ $eq: [{ $type: '$_id' }, 'objectId'] }, 0, 1] } }
    })
    .next();
  if (!bounds) return { endId: null, total: 0, copiedThrough: null };
  if (bounds.invalidIds || !(bounds.endId instanceof Types.ObjectId)) {
    throw new Error(
      'Invalid source ID in remainingData. Review legacy records with non-ObjectId _id values.'
    );
  }
  return { endId: String(bounds.endId), total: bounds.total, copiedThrough: null };
};
