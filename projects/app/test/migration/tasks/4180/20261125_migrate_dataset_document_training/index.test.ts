import { beforeEach, describe, expect, it, vi } from 'vitest';
import type z from 'zod';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { SystemMigrationProgressInputSchema } from '@fastgpt/global/migration/schema';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import type { SystemMigrationContext } from '@/migration/registry';
import { migrateDatasetDocumentTraining } from '@/migration/tasks/4180/20261125_migrate_dataset_document_training';
import { Types, connectionMongo } from '@fastgpt/service/common/mongo';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const queue = vi.hoisted(() => ({ isPaused: vi.fn(), getActiveCount: vi.fn() }));
const balance = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock('@fastgpt/dal/redis/bullmq/services/datasetTraining', () => ({
  datasetTrainingMQService: { getQueue: () => queue }
}));
vi.mock('@fastgpt/dal/redis/caches/lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/dal/redis/caches/lease')>()),
  LeaseCache: class {
    withLease = async <T>({ fn }: { fn: (lease: { assertValid(): void }) => Promise<T> }) =>
      fn({ assertValid: () => {} });
  }
}));
vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamAIPoints: balance.check
}));
vi.mock('@fastgpt/service/support/wallet/sub/utils', () => ({
  teamPoint: { clearTeamPointsCache: vi.fn().mockResolvedValue(undefined) }
}));
vi.mock('@/migration/constants', () => ({ systemMigrationBatchSize: 1 }));

const createContext = () => {
  let checkpoint: Record<string, unknown> | undefined;
  let failedRecords: SystemMigrationFailedRecord[] = [];
  return {
    migrationId: '20261125_migrate_dataset_document_training',
    runId: 'test',
    signal: new AbortController().signal,
    getCheckpoint: async <T>(schema: z.ZodType<T>) =>
      checkpoint === undefined ? undefined : schema.parse(checkpoint),
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      checkpoint = structuredClone(value);
    }),
    getFailedRecords: async () => failedRecords,
    reportFailedRecords: vi.fn(async (records: SystemMigrationFailedRecord[]) => {
      failedRecords = structuredClone(records);
    }),
    reportProgress: vi.fn<SystemMigrationContext['reportProgress']>(async (progress) => {
      SystemMigrationProgressInputSchema.parse(progress);
    }),
    assertActive: vi.fn(async () => {}),
    fail: async (error) => {
      if (error.failedRecords) failedRecords = structuredClone(error.failedRecords);
      throw new Error(error.message);
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;
};

beforeEach(() => {
  queue.isPaused.mockReset().mockResolvedValue(true);
  queue.getActiveCount.mockReset().mockResolvedValue(0);
  balance.check.mockReset().mockResolvedValue(undefined);
});

const getDb = () => {
  const db = connectionMongo.connection.db;
  if (!db) throw new Error('Test MongoDB unavailable');
  return db;
};
const id = (n: number) => new Types.ObjectId(n.toString(16).padStart(24, '0'));
const scope = { teamId: id(61), tmbId: id(62), datasetId: id(63), collectionId: id(64) };

const seedDocument = async () => {
  await getDb().collection('datasets').insertOne({
    _id: scope.datasetId,
    teamId: scope.teamId,
    type: 'dataset',
    vectorModelId: 'vector'
  });
  await getDb().collection('dataset_collections').insertOne({
    _id: scope.collectionId,
    teamId: scope.teamId,
    tmbId: scope.tmbId,
    datasetId: scope.datasetId,
    type: 'file',
    name: 'legacy document'
  });
};

describe('文档级训练存量迁移', () => {
  it('空库无需暂停队列即可完成所有公开阶段', async () => {
    const context = createContext();
    expect(await migrateDatasetDocumentTraining(context)).toMatchObject({
      legacyTasks: 0,
      candidateData: 0,
      documents: 0
    });
    expect(queue.isPaused).not.toHaveBeenCalled();
    expect(
      context.reportProgress.mock.calls
        .map(([progress]) => progress)
        .filter(({ status }) => status === 'succeeded')
        .map(({ key }) => key)
    ).toEqual(['preflight', 'legacyTasks', 'remainingData', 'validation']);
  });

  it('只迁入最新的解析任务，提交后中断重放仍复用一张账单', async () => {
    await seedDocument();
    const tasks = getDb().collection('dataset_trainings');
    const oldest = { _id: id(1), ...scope, mode: 'parse', retryCount: 3, indexSize: 'obsolete' };
    const latest = {
      _id: id(2),
      ...scope,
      mode: 'parse',
      retryCount: 0,
      errorMsg: 'source file is missing'
    };
    await tasks.insertMany([oldest, latest]);

    const context = createContext();
    const save = context.saveCheckpoint.getMockImplementation();
    if (!save) throw new Error('Test checkpoint writer unavailable');
    let interrupted = false;
    context.saveCheckpoint.mockImplementation(async (checkpoint) => {
      const parent = await getDb()
        .collection('dataset_collections')
        .findOne({ _id: scope.collectionId });
      if (!interrupted && parent?.training) {
        interrupted = true;
        throw new Error('interrupted after Mongo commit');
      }
      await save(checkpoint);
    });

    await expect(migrateDatasetDocumentTraining(context)).rejects.toThrow(
      'interrupted after Mongo commit'
    );
    const collection = getDb().collection('dataset_collections');
    const before = await collection.findOne({ _id: scope.collectionId });
    expect(before?.training.parse).toEqual({ status: 'error', errorMsg: 'source file is missing' });

    expect(await migrateDatasetDocumentTraining(context)).toMatchObject({
      legacyTasks: 2,
      documents: 1,
      duplicateParse: 1
    });
    expect((await collection.findOne({ _id: scope.collectionId }))?.training).toEqual(
      before?.training
    );
    expect(
      await getDb()
        .collection('usages')
        .countDocuments({ trainingCollectionId: scope.collectionId })
    ).toBe(1);
    expect(await getDb().collection('usage_items').countDocuments()).toBe(1);
    expect(await tasks.find().sort({ _id: 1 }).toArray()).toEqual([oldest, latest]);
  });

  it('续拷中断快照，TTL 缺失时先失败，补回备份后保持原上界继续', async () => {
    await seedDocument();
    const tasks = getDb().collection('dataset_trainings');
    const records = [
      { _id: id(1), ...scope, mode: 'qa', q: 'original QA', retryCount: 3 },
      { _id: id(2), ...scope, mode: 'parse', retryCount: 3 }
    ];
    await tasks.insertMany(records);
    const context = createContext();
    const save = context.saveCheckpoint.getMockImplementation();
    if (!save) throw new Error('Test checkpoint writer unavailable');

    context.saveCheckpoint
      .mockImplementationOnce(save)
      .mockRejectedValueOnce(new Error('snapshot copy interrupted'));
    await expect(migrateDatasetDocumentTraining(context)).rejects.toThrow(
      'snapshot copy interrupted'
    );
    await tasks.deleteOne({ _id: id(2) }); // 在临时测试库模拟 TTL 删除尚未拷贝的尾记录。
    await expect(migrateDatasetDocumentTraining(context)).rejects.toThrow(
      'Incomplete legacyTasks snapshot'
    );
    expect(await getDb().collection('usages').countDocuments()).toBe(0);
    expect(await getDb().collection('dataset_qa_trainings').countDocuments()).toBe(0);

    const backup = records[1];
    if (!backup) throw new Error('Test backup unavailable');
    await getDb()
      .collection('migration_20261125_dataset_training_tasks')
      .insertOne({ _id: backup._id, source: backup });
    expect(await migrateDatasetDocumentTraining(context)).toMatchObject({
      legacyTasks: 2,
      parse: 1,
      qa: 1
    });
    expect(await tasks.find().toArray()).toEqual([records[0]]);
  });

  it('修复封存的旧任务后从原断点继续，旧任务表保持只读', async () => {
    await seedDocument();
    const tasks = getDb().collection('dataset_trainings');
    const data = getDb().collection('dataset_datas');
    const snapshots = getDb().collection('migration_20261125_dataset_training_tasks');
    const task = {
      _id: id(1),
      ...scope,
      dataId: id(2),
      mode: 'index',
      retryCount: 3,
      q: 'Saved text',
      imageDescMap: 'invalid map'
    };
    await tasks.insertOne(task);
    await data.insertOne({ _id: task.dataId, ...scope, q: task.q, indexStatus: 'indexing' });
    const context = createContext();

    await expect(migrateDatasetDocumentTraining(context)).rejects.toThrow(
      'unresolved source records'
    );
    const editable = { _id: task._id, receipt: { $exists: false } };
    await snapshots.updateOne(editable, { $set: { repair: { collectionId: id(99) } } });
    await expect(migrateDatasetDocumentTraining(context)).rejects.toThrow(
      'unresolved source records'
    );
    expect(await getDb().collection('usages').countDocuments()).toBe(0);

    const imageDescMap = { 'saved-image': 'description from the backup' };
    await snapshots.updateOne(editable, { $set: { repair: { imageDescMap } } });
    expect(await migrateDatasetDocumentTraining(context)).toMatchObject({
      legacyTasks: 1,
      data: 1
    });
    expect(await data.findOne({ _id: task.dataId })).toMatchObject({
      indexStatus: 'index',
      imageDescMap
    });
    const snapshot = await snapshots.findOne({ _id: task._id });
    expect(snapshot).toMatchObject({ source: { imageDescMap }, receipt: { kind: 'data' } });
    expect(snapshot).not.toHaveProperty('repair');
    expect(await tasks.findOne({ _id: task._id })).toEqual(task);
    expect(await context.getFailedRecords()).toEqual([]);
  });

  it('分别续拷状态和旧布尔标记，交叉候选只计一次', async () => {
    await seedDocument();
    const data = getDb().collection('dataset_datas');
    const snapshots = getDb().collection('migration_20261125_dataset_training_data');
    const chunk = {
      ...scope,
      q: 'Saved text',
      indexes: [{ dataId: 'saved-vector', text: 'Saved text', type: 'default' }]
    };
    await data.insertMany([
      { _id: id(1), ...chunk, rebuilding: true },
      { _id: id(2), ...chunk, rebuilding: true, indexStatus: 'waitingRebuild' },
      { _id: id(3), ...chunk, indexStatus: 'rebuildIndexPending' }
    ]);
    const context = createContext();
    const save = context.saveCheckpoint.getMockImplementation();
    if (!save) throw new Error('Test checkpoint writer unavailable');
    context.saveCheckpoint
      .mockImplementationOnce(save)
      .mockRejectedValueOnce(new Error('data snapshot copy interrupted'));

    await expect(migrateDatasetDocumentTraining(context)).rejects.toThrow(
      'data snapshot copy interrupted'
    );
    expect(await snapshots.find({}, { projection: { _id: 1 } }).toArray()).toEqual([
      { _id: id(3) }
    ]);

    expect(await migrateDatasetDocumentTraining(context)).toMatchObject({
      candidateData: 3,
      data: 3
    });
    expect(await snapshots.countDocuments()).toBe(3);
    expect(await data.countDocuments({ indexStatus: 'rebuildIndexPending' })).toBe(3);
    expect(await data.countDocuments({ rebuilding: { $exists: true } })).toBe(0);
    expect(await getDb().collection('usages').countDocuments()).toBe(1);
  });

  it('沿用有向量的分块，恢复索引草稿、QA 和两类重建，并在放行前重查余额', async () => {
    await seedDocument();
    const data = getDb().collection('dataset_datas');
    const indexes = [{ dataId: 'old-vector', type: 'default', text: 'existing index' }];
    const indexed = {
      _id: id(11),
      ...scope,
      indexStatus: 'indexed',
      q: 'keep searchable',
      indexes
    };
    const fullText = {
      _id: id(92),
      ...scope,
      dataId: indexed._id,
      fullTextToken: 'keep searchable'
    };
    await getDb().collection('dataset_data_texts').insertOne(fullText);
    const imageId = `dataset/${scope.datasetId}/old.png`;
    await data.insertMany([
      indexed,
      {
        _id: id(12),
        ...scope,
        indexStatus: 'indexing',
        q: 'pre-created',
        a: 'replace me',
        imageId,
        indexes: []
      },
      { _id: id(13), ...scope, indexStatus: 'rebuildIndexRunning', q: 'rebuild', indexes },
      {
        _id: id(14),
        ...scope,
        indexStatus: 'rebuildSynonymFailed',
        q: 'unpaid rebuild',
        indexes,
        synonymVersion: 2,
        synonymRebuildingVersion: 3,
        indexErrorMsg: 'common:code_error.team_error.ai_points_not_enough'
      },
      {
        _id: id(15),
        ...scope,
        indexStatus: 'rebuildIndexFailed',
        q: 'failed rebuild',
        indexes,
        indexErrorMsg: 'original rebuild error'
      },
      { _id: id(16), ...scope, indexStatus: 'indexing', q: 'orphaned saved text', indexes: [] },
      {
        _id: id(17),
        ...scope,
        indexStatus: 'waitingRebuild',
        q: 'historical synonym',
        indexes,
        synonymVersion: 1
      },
      {
        _id: id(18),
        ...scope,
        indexStatus: 'error',
        indexErrorMsg: 'Training task deleted',
        q: 'cancelled chunk',
        indexes: []
      }
    ]);
    const tasks = getDb().collection('dataset_trainings');
    const legacy = [
      { _id: id(1), ...scope, mode: 'index', dataId: id(11), retryCount: 3 },
      {
        _id: id(2),
        ...scope,
        mode: 'imageParse',
        dataId: id(12),
        q: '',
        a: '',
        indexSize: 128,
        imageDescMap: { [imageId]: 'description' },
        indexes: [{ type: 'custom', text: 'kept draft' }],
        retryCount: 3
      },
      {
        _id: id(3),
        ...scope,
        mode: 'qa',
        q: 'QA input',
        chunkIndex: 4,
        dataMetadata: { keep: true },
        retryCount: 3
      },
      { _id: id(4), ...scope, mode: 'chunk', q: 'historical text', retryCount: 3 },
      { _id: id(5), ...scope, mode: 'rebuild', dataId: id(17), synonymVersion: 5, retryCount: 3 }
    ];
    await tasks.insertMany(legacy);
    balance.check.mockRejectedValueOnce(TeamErrEnum.aiPointsNotEnough);
    const context = createContext();
    const result = await migrateDatasetDocumentTraining(context);
    expect(result).toMatchObject({
      legacyTasks: 5,
      candidateData: 6,
      documents: 1,
      qa: 1,
      indexed: 1,
      data: 7,
      coveredData: 1,
      rebuildSource: 1
    });
    expect(balance.check).toHaveBeenCalledTimes(2);
    expect(await data.findOne({ _id: id(11) })).toEqual(indexed);
    expect(await getDb().collection('dataset_data_texts').findOne({ _id: fullText._id })).toEqual(
      fullText
    );
    expect(await data.findOne({ _id: id(12) })).toMatchObject({
      q: '',
      a: '',
      imageId,
      indexStatus: 'imageParse',
      trainingIndexSize: 128,
      draftIndexes: [{ type: 'custom', text: 'kept draft' }],
      indexes: []
    });
    expect(await data.findOne({ _id: id(13) })).toMatchObject({
      indexStatus: 'rebuildIndexPending',
      indexes
    });
    expect(await data.findOne({ _id: id(14) })).toMatchObject({
      indexStatus: 'rebuildSynonymPending',
      synonymVersion: 2,
      synonymRebuildingVersion: 3,
      indexes
    });
    expect(await data.findOne({ _id: id(14) })).not.toHaveProperty('indexErrorMsg');
    expect(await data.findOne({ _id: id(15) })).toMatchObject({
      indexStatus: 'rebuildIndexPending',
      indexError: true,
      indexErrorMsg: 'original rebuild error',
      indexes
    });
    expect(await data.findOne({ _id: id(16) })).toMatchObject({
      indexStatus: 'index',
      indexError: true,
      q: 'orphaned saved text'
    });
    expect(await data.findOne({ _id: id(17) })).toMatchObject({
      indexStatus: 'rebuildSynonymPending',
      synonymVersion: 1,
      synonymRebuildingVersion: 5,
      indexes
    });
    expect(await data.findOne({ _id: id(18) })).toMatchObject({
      indexStatus: 'error',
      indexErrorMsg: 'Training task deleted',
      q: 'cancelled chunk',
      indexes: []
    });
    expect(await data.findOne({ _id: id(18) })).not.toHaveProperty('indexError');
    expect(await data.findOne({ _id: id(4) })).toMatchObject({
      indexStatus: 'index',
      indexes: [],
      q: 'historical text'
    });
    expect(
      await getDb()
        .collection('dataset_qa_trainings')
        .findOne({ _id: id(3) })
    ).toMatchObject({
      q: 'QA input',
      chunkIndex: 4,
      dataMetadata: { keep: true },
      status: 'active'
    });
    const document = await getDb()
      .collection('dataset_collections')
      .findOne({ _id: scope.collectionId });
    expect(document?.training).toMatchObject({ status: 'active' });
    expect(document?.training).not.toHaveProperty('pausedAt');
    expect(await tasks.find().sort({ _id: 1 }).toArray()).toEqual(legacy);
  });

  it('队列未暂停或仍有活动任务时保留所有旧数据和目标轮次', async () => {
    await seedDocument();
    const source = { _id: id(1), ...scope, mode: 'parse', retryCount: 3 };
    await getDb().collection('dataset_trainings').insertOne(source);
    const context = createContext();
    queue.isPaused.mockResolvedValueOnce(false);
    await expect(migrateDatasetDocumentTraining(context)).rejects.toThrow(
      'Pause the datasetTraining queue'
    );
    queue.getActiveCount.mockResolvedValueOnce(1);
    await expect(migrateDatasetDocumentTraining(context)).rejects.toThrow(
      'Pause the datasetTraining queue'
    );
    expect(context.saveCheckpoint).not.toHaveBeenCalled();
    expect(await getDb().collection('dataset_trainings').findOne()).toEqual(source);
    expect(await getDb().collection('usages').countDocuments()).toBe(0);
  });

  it('只存在新版重建轮次的库不需要暂停队列', async () => {
    await seedDocument();
    await getDb()
      .collection('dataset_collections')
      .updateOne(
        { _id: scope.collectionId },
        {
          $set: { training: { status: 'active', usageId: String(id(80)), revision: 5 } }
        }
      );
    await getDb()
      .collection('dataset_datas')
      .insertOne({
        _id: id(20),
        ...scope,
        indexStatus: 'rebuildIndexRunning'
      });
    const context = createContext();
    expect(await migrateDatasetDocumentTraining(context)).toMatchObject({
      documents: 0,
      candidateData: 0
    });
    expect(queue.isPaused).not.toHaveBeenCalled();
    expect(
      await getDb()
        .collection('dataset_datas')
        .findOne({ _id: id(20) })
    ).toHaveProperty('indexStatus', 'rebuildIndexRunning');
  });

  it('旧任务与现有新版轮次冲突时报错，保留现有轮次和旧任务', async () => {
    await seedDocument();
    const collections = getDb().collection('dataset_collections');
    const training = { status: 'active', usageId: String(id(90)), revision: 7 };
    await collections.updateOne({ _id: scope.collectionId }, { $set: { training } });
    const source = { _id: id(1), ...scope, mode: 'parse', retryCount: 3 };
    await getDb().collection('dataset_trainings').insertOne(source);
    const context = createContext();

    await expect(migrateDatasetDocumentTraining(context)).rejects.toThrow(
      'unresolved source records'
    );
    expect(await context.getFailedRecords()).toMatchObject([
      {
        data: { id: String(source._id) },
        reason: { message: 'Document already has a different or running training round' }
      }
    ]);
    expect(await collections.findOne({ _id: scope.collectionId })).toHaveProperty(
      'training',
      training
    );
    expect(await getDb().collection('dataset_trainings').findOne({ _id: source._id })).toEqual(
      source
    );
    expect(await getDb().collection('usages').countDocuments()).toBe(0);
  });

  it('恢复正式分块重建、答案和图片，并把迁入图片转为持久引用', async () => {
    await seedDocument();
    const data = getDb().collection('dataset_datas');
    const indexes = [{ type: 'default', dataId: 'stable-vector', text: 'old index' }];
    const imageId = `dataset/${scope.datasetId}/newly-migrated.png`;
    await getDb()
      .collection('s3_ttls')
      .insertOne({
        minioKey: imageId,
        bucketName: S3Buckets.private,
        expiredTime: new Date('2030-01-01')
      });
    await data.insertMany([
      { _id: id(20), ...scope, indexStatus: 'indexed', q: 'existing chunk', indexes },
      { _id: id(21), ...scope, indexStatus: 'indexed', q: 'existing synonym chunk', indexes },
      { _id: id(22), ...scope, indexStatus: 'indexing', q: 'old question' }
    ]);
    await getDb()
      .collection('dataset_trainings')
      .insertMany([
        { _id: id(1), ...scope, mode: 'rebuildIndex', dataId: id(20), retryCount: 3 },
        { _id: id(2), ...scope, mode: 'rebuildSynonym', dataId: id(21), retryCount: 3 },
        {
          _id: id(3),
          ...scope,
          mode: 'index',
          dataId: id(22),
          q: '',
          a: 'indexed answer',
          retryCount: 3
        },
        { _id: id(4), ...scope, mode: 'imageParse', q: '', imageId, retryCount: 3 }
      ]);
    const result = await migrateDatasetDocumentTraining(createContext());
    expect(result).toMatchObject({ data: 4, indexed: 0, coveredData: 1 });
    expect(await data.findOne({ _id: id(20) })).toMatchObject({
      indexStatus: 'rebuildIndexPending',
      indexes
    });
    expect(await data.findOne({ _id: id(21) })).toMatchObject({
      indexStatus: 'rebuildSynonymPending',
      indexes
    });
    expect(await data.findOne({ _id: id(22) })).toMatchObject({
      indexStatus: 'index',
      q: '',
      a: 'indexed answer'
    });
    expect(await data.findOne({ _id: id(4) })).toMatchObject({
      indexStatus: 'imageParse',
      imageId,
      indexes: []
    });
    expect(await getDb().collection('s3_ttls').findOne({ minioKey: imageId })).toBeNull();
  });

  it.each([
    { source: 'legacyTasks', stage: 'legacyTasks', collection: 'dataset_trainings', fields: {} },
    {
      source: 'indexStatus',
      stage: 'remainingData',
      collection: 'dataset_datas',
      fields: { indexStatus: 'indexing' }
    },
    {
      source: 'rebuilding',
      stage: 'remainingData',
      collection: 'dataset_datas',
      fields: { rebuilding: true }
    }
  ])('拒绝 $source 中越出 ObjectId 游标范围的旧数据', async ({ stage, collection, fields }) => {
    await seedDocument();
    await getDb()
      .collection('dataset_trainings')
      .insertOne({ _id: id(1), ...scope, mode: 'parse', retryCount: 3 });
    await getDb()
      .collection<{ _id: string; indexStatus?: string; rebuilding?: boolean }>(collection)
      .insertOne({ _id: 'historical string id', ...fields });
    const context = createContext();
    await expect(migrateDatasetDocumentTraining(context)).rejects.toThrow(
      `Invalid source ID in ${stage}`
    );
    expect(context.saveCheckpoint).not.toHaveBeenCalled();
    expect(await getDb().collection('usages').countDocuments()).toBe(0);
  });

  it('所有权和源格式错误保留安全明细并阻止业务写入', async () => {
    await seedDocument();
    const wrongCollectionId = id(65);
    await getDb()
      .collection('dataset_collections')
      .insertOne({
        _id: wrongCollectionId,
        datasetId: scope.datasetId,
        tmbId: scope.tmbId,
        teamId: String(scope.teamId),
        name: 'Invalid owner'
      });
    await getDb()
      .collection('dataset_trainings')
      .insertMany([
        {
          _id: id(1),
          ...scope,
          mode: 'parse',
          imageDescMap: { 'https://images.invalid/?signature=private': 123 },
          retryCount: 3
        },
        {
          _id: id(2),
          ...scope,
          collectionId: wrongCollectionId,
          mode: 'qa',
          q: 'retained text',
          retryCount: 3
        }
      ]);
    const context = createContext();
    await expect(migrateDatasetDocumentTraining(context)).rejects.toThrow(
      'unresolved source records'
    );
    expect(await context.getFailedRecords()).toEqual([
      {
        stageKey: 'preflight',
        data: { sourceStage: 'legacyTasks', id: String(id(1)) },
        reason: { message: 'Invalid record field: imageDescMap' }
      },
      {
        stageKey: 'preflight',
        data: { sourceStage: 'legacyTasks', id: String(id(2)) },
        reason: { message: 'Document belongs to a different team or knowledge base' }
      }
    ]);
    expect(await getDb().collection('usages').countDocuments()).toBe(0);
    expect(await getDb().collection('dataset_qa_trainings').countDocuments()).toBe(0);
  });

  it('按迁移时刻暂停欠费任务，保留容量错误和共用旧账单的历史用量', async () => {
    await seedDocument();
    const capacityCollectionId = id(65);
    await getDb().collection('dataset_collections').insertOne({
      _id: capacityCollectionId,
      teamId: scope.teamId,
      datasetId: scope.datasetId,
      tmbId: scope.tmbId,
      name: 'Capacity error'
    });
    const usages = getDb().collection('usages');
    const oldBill = { _id: id(81), teamId: scope.teamId, totalPoints: 75 };
    await usages.insertOne(oldBill);
    await getDb()
      .collection('dataset_trainings')
      .insertMany([
        {
          _id: id(1),
          ...scope,
          mode: 'qa',
          q: 'paused input',
          retryCount: 0,
          lockTime: new Date('2050-01-01'),
          errorMsg: 'common:code_error.team_error.ai_points_not_enough',
          billId: String(oldBill._id)
        },
        {
          _id: id(2),
          ...scope,
          collectionId: capacityCollectionId,
          mode: 'parse',
          retryCount: 3,
          lockTime: new Date('2050-01-01'),
          errorMsg: 'common:code_error.team_error.dataset_size_not_enough',
          billId: String(oldBill._id)
        }
      ]);
    balance.check.mockRejectedValue(TeamErrEnum.aiPointsNotEnough);
    const start = new Date();
    expect(await migrateDatasetDocumentTraining(createContext())).toMatchObject({
      documents: 2,
      parse: 1,
      qa: 1
    });
    const collections = getDb().collection('dataset_collections');
    const unpaid = await collections.findOne({ _id: scope.collectionId });
    const capacity = await collections.findOne({ _id: capacityCollectionId });
    expect(unpaid?.training).toMatchObject({ status: 'paused_unpaid', pausedAt: expect.any(Date) });
    expect(unpaid?.training.pausedAt.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(capacity?.training).toMatchObject({
      status: 'active',
      parse: { status: 'error', errorMsg: 'common:code_error.team_error.dataset_size_not_enough' }
    });
    expect(capacity?.training.usageId).not.toBe(unpaid?.training.usageId);
    expect(await usages.countDocuments({ trainingCollectionId: { $exists: true } })).toBe(2);
    expect(await usages.findOne({ _id: oldBill._id })).toEqual(oldBill);
  });

  it('重建失败缺少原因时先保留分块，核实原因后从同一快照续迁', async () => {
    await seedDocument();
    const data = getDb().collection('dataset_datas');
    const original = {
      _id: id(1),
      ...scope,
      q: 'Saved text',
      indexes: [{ dataId: 'saved-vector', text: 'Saved text', type: 'default' }],
      indexStatus: 'rebuildIndexFailed'
    };
    await data.insertOne(original);
    const context = createContext();

    await expect(migrateDatasetDocumentTraining(context)).rejects.toThrow(
      'unresolved source records'
    );
    expect(await context.getFailedRecords()).toEqual([
      {
        stageKey: 'remainingData',
        data: { sourceStage: 'remainingData', id: String(original._id) },
        reason: { message: 'Failed legacy rebuild has no error' }
      }
    ]);
    expect(await data.findOne({ _id: original._id })).toEqual(original);
    expect(await getDb().collection('usages').countDocuments()).toBe(0);

    const snapshots = getDb().collection('migration_20261125_dataset_training_data');
    const indexErrorMsg = 'Recovered the original rebuild error from the backup';
    await snapshots.updateOne(
      { _id: original._id, receipt: { $exists: false } },
      { $set: { repair: { indexErrorMsg } } }
    );
    expect(await migrateDatasetDocumentTraining(context)).toMatchObject({
      candidateData: 1,
      data: 1
    });
    expect(await data.findOne({ _id: original._id })).toMatchObject({
      indexes: original.indexes,
      indexStatus: 'rebuildIndexPending',
      indexError: true,
      indexErrorMsg
    });
    expect(await context.getFailedRecords()).toEqual([]);
  });

  it('账单验收失败保留文档定位，修复后同一断点完成验证', async () => {
    await seedDocument();
    await getDb()
      .collection('dataset_trainings')
      .insertOne({ _id: id(1), ...scope, mode: 'parse', retryCount: 3 });
    const usages = getDb().collection('usages');
    const context = createContext();
    context.reportProgress.mockImplementation(async (progress) => {
      SystemMigrationProgressInputSchema.parse(progress);
      if (progress.key === 'validation' && progress.status === 'running') {
        await usages.updateOne(
          { trainingCollectionId: scope.collectionId },
          { $set: { totalPoints: 42 } }
        );
      }
    });
    await expect(migrateDatasetDocumentTraining(context)).rejects.toThrow(
      'unresolved source records'
    );
    expect(await context.getFailedRecords()).toEqual([
      {
        stageKey: 'validation',
        data: { sourceStage: 'round', id: String(scope.collectionId) },
        reason: { message: 'Migration training bill is missing or mismatched' }
      }
    ]);

    await usages.updateOne(
      { trainingCollectionId: scope.collectionId },
      { $set: { totalPoints: 0 } }
    );
    context.reportProgress.mockImplementation(async (progress) => {
      SystemMigrationProgressInputSchema.parse(progress);
    });
    expect(await migrateDatasetDocumentTraining(context)).toMatchObject({ documents: 1, parse: 1 });
    expect(await context.getFailedRecords()).toEqual([]);
    expect(await usages.countDocuments({ trainingCollectionId: scope.collectionId })).toBe(1);
  });
});
