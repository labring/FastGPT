import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { mongo } from 'mongoose';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  DatasetDataIndexStageEnum as Stage,
  DatasetDataIndexStatusEnum as Status,
  DatasetDataIndexTypeEnum as IndexType
} from '@fastgpt/global/core/dataset/data/constants';
import { DatasetCollectionTrainingSchema } from '@fastgpt/global/core/dataset/type';
import { Types, type ClientSession } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { isS3ObjectKey, removeS3TTL } from '@fastgpt/service/common/s3/utils';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { isAuthorizedDatasetFileS3Key } from '@fastgpt/service/common/s3/sources/dataset/key';
import { DatasetColCollectionName } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetDataCollectionName } from '@fastgpt/service/core/dataset/data/schema';
import { DatasetCollectionName } from '@fastgpt/service/core/dataset/schema';
import { DatasetQaTrainingCollectionName } from '@fastgpt/service/core/dataset/training/qaSchema';
import {
  createMigrationBill,
  getCurrentBalance,
  getInitialBalance,
  getMigrationUsageId,
  prepareBalance,
  recordRound,
  streamRounds,
  validateMigrationBill,
  type Round
} from './billing';
import {
  getTaskError,
  insufficientPoints,
  LegacyDataRepairSchema,
  LegacyDataSchema,
  LegacyIndexContentSchema,
  LegacyTaskRepairSchema,
  LegacyTaskSchema,
  MigrationRecordError,
  parseRecord,
  ScopeSchema,
  type LegacyData,
  type LegacyTask,
  type Scope
} from './records';
import {
  getMigrationDb,
  getSnapshot,
  getSnapshotMetadata,
  type Receipt,
  type SnapshotRow,
  type SourceStage
} from './snapshot';

type Parent = { collection: mongo.Document; dataset: mongo.Document };
type Execution = { migrationId: string; cutoverAt: Date; assertActive: () => Promise<void> };
type Source = { stage: SourceStage; row: SnapshotRow };
type Work = {
  kind: 'parse' | 'qa' | 'data';
  targetId: Types.ObjectId;
  runnable: boolean;
  value: mongo.Document;
  unset?: string[];
  insert?: boolean;
};

/** 在写入前核验源记录及所属文档，并为有效团队保留一份跨批余额判定。 */
export const preflightSource = async ({ stage, row }: Source, execution: Execution) => {
  const scope = parseRecord(ScopeSchema, row.source);
  const parent = await readParent(scope);
  if (!parent) return;
  if (await isDuplicateParse({ source: { stage, row }, scope })) return;
  parseSource({ stage, row });
  verifyRound({ parent, scope, migrationId: execution.migrationId });
  await prepareBalance(scope.teamId, execution.assertActive);
};

/** 单条源的业务结果和快照回执原子提交，重放沿用本次迁移已经确认的结果。 */
export const applySource = ({ stage, row }: Source, execution: Execution) =>
  mongoSessionRun(async (session) => {
    await execution.assertActive();
    const snapshot = getSnapshot(stage);
    const current = await snapshot.findOne({ _id: row._id }, { session });
    if (!current) throw new Error('Frozen migration source disappeared');
    if (current.receipt) return;

    const source = { stage, row: current };
    const scope = parseRecord(ScopeSchema, current.source);
    const parent = await readParent(scope, session);
    let repaired: mongo.Document | undefined;
    const result = await (async (): Promise<Receipt> => {
      if (!parent) return { kind: 'deletedParent' };
      if (await isDuplicateParse({ source, scope }, session)) return { kind: 'duplicateParse' };
      const usageId = verifyRound({ parent, scope, migrationId: execution.migrationId });
      repaired = getRepairedSource(source);
      const input = repaired ?? current.source;
      const planned =
        stage === 'legacyTasks'
          ? await planTask(
              { task: parseRecord(LegacyTaskSchema, input), cutoverAt: execution.cutoverAt },
              session
            )
          : await planRemainingData(
              { row: current, frozen: parseRecord(LegacyDataSchema, input) },
              session
            );
      if (!('runnable' in planned)) return planned;

      if (planned.insert) await verifyNewTarget(planned, session);
      await execution.assertActive();
      await ensureRound({ parent, scope, usageId, work: planned, execution }, session);
      return writeWork({ scope, usageId, work: planned }, session);
    })();
    await execution.assertActive();
    const recorded = await snapshot.updateOne(
      { _id: row._id, receipt: { $exists: false } },
      {
        $set: { receipt: result, ...(repaired && { source: repaired }) },
        ...(repaired && { $unset: { repair: '' } })
      },
      { session }
    );
    if (recorded.matchedCount !== 1)
      throw new Error('Frozen migration result changed before commit');
  });

/** 从冻结来源逐条验收目标引用、所有权和实际保存的训练字段。 */
export const validateSource = async ({ stage, row }: Source, migrationId: string) => {
  const receipt = row.receipt;
  if (!receipt) throw new MigrationRecordError('Frozen source has no completed migration result');
  const scope = parseRecord(ScopeSchema, row.source);
  if (receipt.kind === 'deletedParent') {
    if (await readParent(scope))
      throw new MigrationRecordError('Deleted source parent is now present');
    return receipt.kind;
  }
  if (receipt.kind === 'indexed') {
    const task = parseRecord(LegacyTaskSchema, row.source);
    if (!task.dataId || !hasFormalIndexes(await readScopedData({ id: task.dataId, scope }))) {
      throw new MigrationRecordError('Completed data is missing its formal index references');
    }
  }
  if (receipt.kind === 'coveredData') {
    if (
      stage !== 'remainingData' ||
      !(await getSnapshot('legacyTasks').findOne({
        'receipt.kind': 'data',
        'receipt.targetId': row._id,
        'source.dataId': row._id
      }))
    ) {
      throw new MigrationRecordError('Data has no matching legacy task result');
    }
  }
  if (receipt.kind === 'rebuildSource') {
    const task = parseRecord(LegacyTaskSchema, row.source);
    if (
      !task.dataId ||
      !(await getSnapshot('remainingData').findOne({ _id: task.dataId, 'receipt.kind': 'data' }))
    ) {
      throw new MigrationRecordError('Legacy rebuild task has no migrated data result');
    }
  }
  if (!('targetId' in receipt)) return receipt.kind;

  const round = await getSnapshotMetadata<Round>().findOne({
    _id: `round:${scope.collectionId}`,
    ...scope
  });
  if (!round)
    throw new MigrationRecordError('Migrated target is missing its round validation record');
  const parent = await readParent(scope);
  if (!parent?.collection.training)
    throw new MigrationRecordError('Migrated document training round is missing');
  verifyRound({ parent, scope, migrationId });
  const target =
    receipt.kind === 'parse'
      ? parent.collection.training.parse
      : receipt.kind === 'qa'
        ? await getMigrationDb()
            .collection(DatasetQaTrainingCollectionName)
            .findOne({ _id: receipt.targetId, ...scope })
        : await readScopedData({ id: receipt.targetId, scope });
  if (!target || digestFields(target, receipt.fields) !== receipt.digest) {
    throw new MigrationRecordError(
      'Migrated target is missing or differs from the committed result'
    );
  }
  return receipt.kind;
};

/** 仅校验、刷新本次建立的文档轮次，实际续跑留给正常的队列和对账。 */
export const validateAndRefreshRounds = async (
  execution: Execution,
  validate: (id: Types.ObjectId, action: () => Promise<void>) => Promise<void>
) => {
  let checkedTeam: string | undefined;
  let paid = false;
  let count = 0;
  for await (const round of streamRounds()) {
    await execution.assertActive();
    await validate(round.collectionId, async () => {
      const scope = parseRecord(ScopeSchema, round);
      const parent = await readParent(scope);
      if (!parent?.collection.training)
        throw new MigrationRecordError('Migration training round is missing');
      const usageId = verifyRound({ parent, scope, migrationId: execution.migrationId });
      await validateMigrationBill({ ...parent, scope, usageId, time: execution.cutoverAt });

      const teamId = String(scope.teamId);
      if (checkedTeam !== teamId) {
        paid = await getCurrentBalance(scope.teamId);
        checkedTeam = teamId;
      }
      await execution.assertActive();
      await setRoundBalance({ round, usageId, paid, cutoverAt: execution.cutoverAt });
      count++;
    });
  }
  return count;
};

const parseSource = (source: Source) => {
  const input = getRepairedSource(source) ?? source.row.source;
  return source.stage === 'legacyTasks'
    ? parseRecord(LegacyTaskSchema, input)
    : parseRecord(LegacyDataSchema, input);
};

/** 只读取未提交记录上的修复，业务写入和修复后的快照在同一个事务提交。 */
const getRepairedSource = ({ stage, row }: Source) => {
  if (row.receipt || row.repair === undefined) return;
  const repair =
    stage === 'legacyTasks'
      ? parseRecord(LegacyTaskRepairSchema, row.repair)
      : parseRecord(LegacyDataRepairSchema, row.repair);
  return { ...row.source, ...repair };
};

const readParent = async (scope: Scope, session?: ClientSession): Promise<Parent | undefined> => {
  const db = getMigrationDb();
  const collection = await db
    .collection(DatasetColCollectionName)
    .findOne({ _id: scope.collectionId }, { session });
  if (
    collection &&
    (!sameMongoId(scope.teamId, collection.teamId) ||
      !sameMongoId(scope.datasetId, collection.datasetId))
  ) {
    throw new MigrationRecordError('Document belongs to a different team or knowledge base');
  }
  const dataset = await db
    .collection(DatasetCollectionName)
    .findOne({ _id: scope.datasetId }, { session });
  if (dataset && !sameMongoId(scope.teamId, dataset.teamId)) {
    throw new MigrationRecordError('Knowledge base belongs to a different team');
  }
  if (!dataset || (dataset.deleteTime !== null && dataset.deleteTime !== undefined) || !collection)
    return;
  if (dataset.type === DatasetTypeEnum.folder)
    throw new MigrationRecordError('A folder cannot own training work');
  return { collection, dataset };
};

const sameMongoId = (expected: Types.ObjectId, value: unknown) =>
  value instanceof Types.ObjectId && expected.equals(value);

const verifyRound = ({
  parent,
  scope,
  migrationId
}: {
  parent: Parent;
  scope: Scope;
  migrationId: string;
}) => {
  const usageId = getMigrationUsageId(migrationId, scope.collectionId);
  if (parent.collection.training !== null && parent.collection.training !== undefined) {
    const training = parseRecord(DatasetCollectionTrainingSchema, parent.collection.training);
    if (training.usageId !== String(usageId) || training.runId) {
      throw new MigrationRecordError('Document already has a different or running training round');
    }
  }
  return usageId;
};

const readScopedData = async (
  { id, scope }: { id: Types.ObjectId; scope: Scope },
  session?: ClientSession
) => {
  const data = await getMigrationDb()
    .collection(DatasetDataCollectionName)
    .findOne({ _id: id }, { session });
  if (
    data &&
    (!sameMongoId(scope.teamId, data.teamId) ||
      !sameMongoId(scope.datasetId, data.datasetId) ||
      !sameMongoId(scope.collectionId, data.collectionId))
  ) {
    throw new MigrationRecordError('Referenced data belongs to a different document');
  }
  return data;
};

/** 先按冻结的归属选出唯一解析源，再校验获选任务的内容。 */
const isDuplicateParse = async (
  { source: { stage, row }, scope }: { source: Source; scope: Scope },
  session?: ClientSession
) => {
  if (stage !== 'legacyTasks' || row.source.mode !== 'parse') return false;
  return Boolean(
    await getSnapshot('legacyTasks').findOne(
      {
        'source.collectionId': scope.collectionId,
        'source.teamId': scope.teamId,
        'source.datasetId': scope.datasetId,
        'source.mode': 'parse',
        _id: { $gt: row._id }
      },
      { projection: { _id: 1 }, session }
    )
  );
};

const planTask = async (
  { task, cutoverAt }: { task: LegacyTask; cutoverAt: Date },
  session: ClientSession
): Promise<Receipt | Work> => {
  const scope = ScopeSchema.parse(task);
  if (task.mode === 'parse') {
    const errorMsg = getTaskError(task);
    return {
      kind: 'parse',
      targetId: scope.collectionId,
      runnable: !errorMsg,
      value: { status: errorMsg ? 'error' : 'active', ...(errorMsg && { errorMsg }) }
    };
  }
  if (task.mode === 'qa') {
    if (!task.q?.trim()) throw new MigrationRecordError('QA source text is empty');
    const errorMsg = getTaskError(task);
    return {
      kind: 'qa',
      targetId: task._id,
      runnable: !errorMsg,
      insert: true,
      value: {
        ...scope,
        tmbId: task.tmbId,
        q: task.q,
        chunkIndex: task.chunkIndex ?? 0,
        ...(task.dataMetadata && { dataMetadata: task.dataMetadata }),
        status: errorMsg ? 'error' : 'active',
        ...(errorMsg && { errorMsg }),
        createTime: cutoverAt,
        updateTime: cutoverAt
      }
    };
  }

  if (!task.dataId) {
    if (task.mode === 'chunk' || isEnhancement(task.mode))
      return firstIndexWork({ task, cutoverAt });
    throw new MigrationRecordError('Legacy index task is missing its data ID');
  }

  const data = await readScopedData({ id: task.dataId, scope }, session);
  if (!data) throw new MigrationRecordError('Legacy index task references missing data');
  const frozen = await getSnapshot('remainingData').findOne({ _id: task.dataId }, { session });
  const legacy = parseRecord(
    LegacyDataSchema,
    frozen ? (getRepairedSource({ stage: 'remainingData', row: frozen }) ?? frozen.source) : data
  );
  const rebuildStage = getRebuildStage(legacy);
  if (rebuildStage) return { kind: 'rebuildSource' };

  // 多条旧任务除 parse 外可能持有不同草稿，不能互相覆盖。
  if (
    await getSnapshot('legacyTasks').findOne(
      { 'source.dataId': task.dataId, 'receipt.kind': 'data' },
      { session, projection: { _id: 1 } }
    )
  ) {
    throw new MigrationRecordError('Multiple legacy tasks target the same data');
  }
  if (legacy.indexStatus === Status.indexing || legacy.indexStatus === Status.error) {
    if (isRebuildTask(task))
      throw new MigrationRecordError('Rebuild task references data that has never been indexed');
    if (legacy.indexStatus === Status.indexing) {
      if (!frozen)
        throw new MigrationRecordError(
          'Legacy first-index target is absent from the frozen snapshot'
        );
      assertUnchangedData({ data, frozen: frozen.source });
    } else if (frozen) {
      assertUnchangedData({ data, frozen: frozen.source });
    }
    return firstIndexWork({ task, data, cutoverAt });
  }
  if (
    (legacy.indexStatus !== undefined && legacy.indexStatus !== Status.indexed) ||
    !hasFormalIndexes(data)
  )
    throw new MigrationRecordError('Cannot determine legacy index state');
  if (task.mode === 'index') return { kind: 'indexed' };

  // 旧增强任务可直接转入 rebuildIndex，已存在的正式索引不会取消这项重建任务。
  return rebuildWork({ data: legacy, stage: Stage.rebuildIndexPending, evidence: task });
};

const planRemainingData = async (
  { row, frozen }: { row: SnapshotRow; frozen: LegacyData },
  session: ClientSession
): Promise<Receipt | Work> => {
  const scope = ScopeSchema.parse(frozen);
  const data = await readScopedData({ id: frozen._id, scope }, session);
  if (!data) throw new MigrationRecordError('Frozen data no longer exists');
  if (
    await getSnapshot('legacyTasks').findOne(
      {
        'source.dataId': frozen._id,
        'receipt.kind': 'data',
        'receipt.targetId': frozen._id
      },
      { projection: { _id: 1 }, session }
    )
  ) {
    return { kind: 'coveredData' };
  }
  assertUnchangedData({ data, frozen: row.source });

  const stage = getRebuildStage(frozen);
  if (stage) {
    if (!hasFormalIndexes(data))
      throw new MigrationRecordError('Rebuild data has no formal index references');
    const related = await getSnapshot('legacyTasks').findOne(
      {
        'source.dataId': frozen._id,
        'source.teamId': scope.teamId,
        'source.datasetId': scope.datasetId,
        'source.collectionId': scope.collectionId,
        'receipt.kind': 'rebuildSource'
      },
      { sort: { _id: -1 }, session }
    );
    const evidence = related ? parseRecord(LegacyTaskSchema, related.source) : undefined;
    return rebuildWork({ data: frozen, stage, evidence });
  }
  if (frozen.indexStatus !== Status.indexing) {
    throw new MigrationRecordError('Unrecognized legacy data status');
  }
  if (!hasIndexInput(data))
    throw new MigrationRecordError('Legacy data has no usable text or image');
  return {
    kind: 'data',
    targetId: frozen._id,
    runnable: false,
    value: {
      indexStatus: Stage.index,
      indexError: true,
      indexErrorMsg: frozen.indexErrorMsg?.trim()
        ? frozen.indexErrorMsg
        : 'Legacy index task is missing. Retry using the saved data.'
    }
  };
};

const firstIndexWork = ({
  task,
  data,
  cutoverAt
}: {
  task: LegacyTask;
  data?: mongo.Document;
  cutoverAt: Date;
}): Work => {
  const content = parseRecord(LegacyIndexContentSchema, data ?? {});
  const q = task.q ?? content.q ?? '';
  const a = task.a ?? content.a ?? undefined;
  const imageId = task.imageId ?? content.imageId;
  if (!hasIndexInput({ q, a, imageId }))
    throw new MigrationRecordError('Legacy index task has no usable text or image');
  if (isS3ObjectKey(imageId, 'dataset')) {
    if (!isAuthorizedDatasetFileS3Key({ key: imageId, datasetId: String(task.datasetId) })) {
      throw new MigrationRecordError('Legacy image belongs to a different knowledge base');
    }
    if (!data && !S3Buckets.private)
      throw new MigrationRecordError('Private storage is required to retain the migrated image');
  }
  const errorMsg = getTaskError(task);
  const targetId = task.dataId ?? task._id;
  const indexes = task.indexes?.length ? task.indexes : (content.indexes ?? []);
  const draftIndexes = indexes
    .filter(
      (index) =>
        index.text !== '' &&
        index.type !== IndexType.default &&
        index.type !== IndexType.imageEmbedding
    )
    .map(({ text, type }) => ({ text, type: type ?? IndexType.custom }));
  return {
    kind: 'data',
    targetId,
    runnable: !errorMsg,
    insert: !data,
    value: {
      ...(!data && {
        ...ScopeSchema.parse(task),
        tmbId: task.tmbId,
        chunkIndex: task.chunkIndex ?? 0,
        ...(task.dataMetadata && { metadata: task.dataMetadata }),
        indexes: [],
        updateTime: cutoverAt
      }),
      q,
      ...(a !== undefined && { a }),
      ...(imageId && { imageId }),
      ...(task.imageDescMap && { imageDescMap: task.imageDescMap }),
      draftIndexes,
      ...(task.indexSize !== undefined && { trainingIndexSize: task.indexSize }),
      indexStatus: isEnhancement(task.mode) ? task.mode : Stage.index,
      ...(errorMsg && { indexError: true, indexErrorMsg: errorMsg })
    },
    ...(!errorMsg && { unset: ['indexError', 'indexErrorMsg'] })
  };
};

const getRebuildStage = ({ indexStatus, rebuilding }: LegacyData) => {
  switch (indexStatus) {
    case Status.rebuildSynonymPending:
    case Status.rebuildSynonymRunning:
    case Status.rebuildSynonymFailed:
      return Stage.rebuildSynonymPending;
    case Status.rebuildIndexPending:
    case Status.rebuildIndexRunning:
    case Status.rebuildIndexFailed:
    case 'waitingRebuild':
    case 'rebuilding':
    case 'rebuildError':
      return Stage.rebuildIndexPending;
    default:
      return rebuilding &&
        (indexStatus === null || indexStatus === undefined || indexStatus === Status.indexed)
        ? Stage.rebuildIndexPending
        : undefined;
  }
};

const rebuildWork = ({
  data,
  stage,
  evidence
}: {
  data: LegacyData;
  stage: Stage;
  evidence?: LegacyTask;
}): Work => {
  const failed =
    data.indexStatus === Status.rebuildIndexFailed ||
    data.indexStatus === Status.rebuildSynonymFailed ||
    data.indexStatus === 'rebuildError';
  const doHistoricalRebuild = ![
    Status.rebuildIndexPending,
    Status.rebuildIndexRunning,
    Status.rebuildSynonymPending,
    Status.rebuildSynonymRunning
  ].some((status) => status === data.indexStatus);
  const errorMsg = (() => {
    if (failed) {
      const message = data.indexErrorMsg?.trim() ? data.indexErrorMsg : evidence?.errorMsg;
      if (!message?.trim()) throw new MigrationRecordError('Failed legacy rebuild has no error');
      return message === insufficientPoints ? undefined : message;
    }
    return evidence && doHistoricalRebuild ? getTaskError(evidence) : undefined;
  })();
  const isGenericState =
    !data.indexStatus ||
    ['indexed', 'waitingRebuild', 'rebuilding', 'rebuildError'].includes(data.indexStatus);
  const useHistoricalSynonym =
    isGenericState &&
    evidence &&
    (evidence.mode === 'rebuildSynonym' ||
      (isRebuildTask(evidence) && Boolean(evidence.synonymVersion)));
  const synonymVersion =
    data.synonymRebuildingVersion ?? (useHistoricalSynonym ? evidence?.synonymVersion : undefined);
  return {
    kind: 'data',
    targetId: data._id,
    runnable: !errorMsg,
    value: {
      indexStatus: useHistoricalSynonym ? Stage.rebuildSynonymPending : stage,
      ...(synonymVersion && { synonymRebuildingVersion: synonymVersion }),
      ...(errorMsg && { indexError: true, indexErrorMsg: errorMsg })
    },
    unset: ['rebuilding', ...(!errorMsg ? ['indexError', 'indexErrorMsg'] : [])]
  };
};

const isEnhancement = (mode: LegacyTask['mode']) =>
  mode === 'imageParse' || mode === 'image' || mode === 'auto';
const isRebuildTask = (task: LegacyTask) =>
  task.mode === 'rebuild' || task.mode === 'rebuildIndex' || task.mode === 'rebuildSynonym';
const hasIndexInput = (data: mongo.Document) =>
  (typeof data.q === 'string' && Boolean(data.q.trim())) ||
  (typeof data.a === 'string' && Boolean(data.a.trim())) ||
  (typeof data.imageId === 'string' && Boolean(data.imageId));
const hasFormalIndexes = (data: mongo.Document | null) =>
  data !== null &&
  Array.isArray(data.indexes) &&
  data.indexes.length > 0 &&
  data.indexes.every((index) => typeof index?.dataId === 'string' && Boolean(index.dataId.trim()));

const assertUnchangedData = ({
  data,
  frozen
}: {
  data: mongo.Document;
  frozen: mongo.Document;
}) => {
  // 以原始快照核对分块，确认需要修复的错误字段在实际分块中也符合冻结时的值。
  if (
    Object.keys(LegacyDataSchema.shape).some((key) => !isDeepStrictEqual(data[key], frozen[key]))
  ) {
    throw new MigrationRecordError('Data status changed since the migration source was frozen');
  }
};

const verifyNewTarget = async (work: Work, session: ClientSession) => {
  const name = work.kind === 'qa' ? DatasetQaTrainingCollectionName : DatasetDataCollectionName;
  if (
    await getMigrationDb()
      .collection(name)
      .findOne({ _id: work.targetId }, { session, projection: { _id: 1 } })
  ) {
    throw new MigrationRecordError('Migration target ID is already in use');
  }
};

const ensureRound = async (
  {
    parent,
    scope,
    usageId,
    work,
    execution
  }: {
    parent: Parent;
    scope: Scope;
    usageId: Types.ObjectId;
    work: Work;
    execution: Execution;
  },
  session: ClientSession
) => {
  const collection = getMigrationDb().collection(DatasetColCollectionName);
  const match = { _id: scope.collectionId, teamId: scope.teamId, datasetId: scope.datasetId };
  const pause = work.runnable && !(await getInitialBalance(scope.teamId));
  const training = parent.collection.training;
  if (!training) {
    await createMigrationBill({ ...parent, scope, usageId, time: execution.cutoverAt }, session);
    const updated = await collection.updateOne(
      { ...match, training: null },
      {
        $set: {
          training: {
            status: pause ? 'paused_unpaid' : 'active',
            ...(pause && { pausedAt: execution.cutoverAt }),
            usageId: String(usageId),
            revision: 1
          }
        }
      },
      { session }
    );
    if (updated.matchedCount !== 1)
      throw new MigrationRecordError('Training round changed before creation');
  } else if (pause && training.status !== 'paused_unpaid') {
    const updated = await collection.updateOne(
      { ...match, 'training.usageId': String(usageId) },
      {
        $set: {
          'training.status': 'paused_unpaid',
          'training.pausedAt': execution.cutoverAt
        }
      },
      { session }
    );
    if (updated.matchedCount !== 1)
      throw new MigrationRecordError('Training round changed before pausing');
  }
  await recordRound({ scope, runnable: work.runnable }, session);
};

const writeWork = async (
  { work, scope, usageId }: { work: Work; scope: Scope; usageId: Types.ObjectId },
  session: ClientSession
): Promise<Receipt> => {
  const db = getMigrationDb();
  if (work.kind === 'parse') {
    const updated = await db.collection(DatasetColCollectionName).updateOne(
      {
        _id: scope.collectionId,
        teamId: scope.teamId,
        datasetId: scope.datasetId,
        'training.usageId': String(usageId)
      },
      { $set: { 'training.parse': work.value } },
      { session }
    );
    if (updated.matchedCount !== 1)
      throw new MigrationRecordError('Training round changed before writing the parse task');
  } else {
    const target = db.collection(
      work.kind === 'qa' ? DatasetQaTrainingCollectionName : DatasetDataCollectionName
    );
    if (work.insert) {
      await target.insertOne({ _id: work.targetId, ...work.value }, { session });
      if (work.kind === 'data' && isS3ObjectKey(work.value.imageId, 'dataset')) {
        await removeS3TTL({ key: work.value.imageId, bucketName: 'private', session });
      }
    } else {
      const updated = await target.updateOne(
        { _id: work.targetId, ...scope },
        {
          $set: work.value,
          ...(work.unset?.length && {
            $unset: Object.fromEntries(work.unset.map((key) => [key, '']))
          })
        },
        { session }
      );
      if (updated.matchedCount !== 1)
        throw new MigrationRecordError('Migration data changed before commit');
    }
  }
  const fields = [...Object.keys(work.value), ...(work.unset ?? [])].sort();
  return {
    kind: work.kind,
    targetId: work.targetId,
    fields,
    digest: digestFields(work.value, fields)
  };
};

const digestFields = (value: mongo.Document, fields: string[]) =>
  createHash('sha256')
    .update(JSON.stringify(fields.map((key) => [key, Object.hasOwn(value, key), value[key]])))
    .digest('hex');

const setRoundBalance = async ({
  round,
  usageId,
  paid,
  cutoverAt
}: {
  round: Round;
  usageId: Types.ObjectId;
  paid: boolean;
  cutoverAt: Date;
}) => {
  const scope = ScopeSchema.parse(round);
  const pause = round.runnable && !paid;
  const result = await getMigrationDb()
    .collection(DatasetColCollectionName)
    .updateOne(
      {
        _id: scope.collectionId,
        teamId: scope.teamId,
        datasetId: scope.datasetId,
        'training.usageId': String(usageId),
        'training.runId': { $exists: false }
      },
      pause
        ? { $set: { 'training.status': 'paused_unpaid', 'training.pausedAt': cutoverAt } }
        : { $set: { 'training.status': 'active' }, $unset: { 'training.pausedAt': '' } }
    );
  if (result.matchedCount !== 1)
    throw new MigrationRecordError('Migration round changed during balance refresh');
};
