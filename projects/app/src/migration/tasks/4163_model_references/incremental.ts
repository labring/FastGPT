import {
  systemMigrationLimits,
  SystemMigrationStatusEnum
} from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import type { SystemMigrationContext } from '@/migration/registry';
import { z } from 'zod';
import type { ReferenceTransformResult } from './types';

const BATCH_SIZE = 100;
const WRITE_CONCURRENCY = 20;

const StageCheckpointSchema = z.object({
  key: z.string(),
  initialized: z.boolean(),
  endId: z.string().nullable(),
  lastId: z.string().nullable(),
  processed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative()
});

const IncrementalCheckpointSchema = z.object({
  version: z.literal(1),
  stageIndex: z.number().int().nonnegative(),
  stages: z.array(StageCheckpointSchema)
});

type IncrementalCheckpoint = z.infer<typeof IncrementalCheckpointSchema>;

export type IncrementalMigrationStage = {
  key: string;
  collectionName: string;
  model: any;
  query?: Record<string, unknown>;
  transform: (record: Record<string, any>) => ReferenceTransformResult;
};

const hasPath = (record: Record<string, any>, path: string) => {
  let current: any = record;
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object' || !(key in current)) return false;
    current = current[key];
  }
  return true;
};

const getValueByPath = (record: Record<string, any>, path: string) =>
  path.split('.').reduce<any>((current, key) => current?.[key], record);

const isIdPath = (path: string) => /(?:^|\.)[^.]*Id$/.test(path);

/**
 * CAS 条件覆盖转换读取过的旧值，避免迁移覆盖在线请求刚写入的新配置。
 *
 * 历史 ID 可能以 BSON ObjectId 保存，但当前 Schema 已改成 String。Mongoose 读取和查询转换
 * 会让二者表面值相同、实际 BSON 类型不同，因此 ID 快照统一在 Mongo 内转成字符串比较。
 */
const getSnapshotFilter = ({
  record,
  result
}: {
  record: Record<string, any>;
  result: ReferenceTransformResult;
}) => {
  const filter: Record<string, unknown> = { _id: record._id };
  const idExpressions: Record<string, unknown>[] = [];
  const snapshotPaths = new Set([
    ...Object.keys(result.snapshot ?? {}),
    ...Object.keys(result.set ?? {})
  ]);
  for (const path of snapshotPaths) {
    if (!hasPath(record, path)) {
      filter[path] = { $exists: false };
      continue;
    }

    const value = getValueByPath(record, path);
    if (isIdPath(path) && value !== undefined && value !== null) {
      idExpressions.push({
        $eq: [
          {
            $convert: {
              input: `$${path}`,
              to: 'string',
              onError: null,
              onNull: null
            }
          },
          String(value)
        ]
      });
      continue;
    }
    filter[path] = value;
  }
  if (idExpressions.length > 0) {
    filter.$expr = idExpressions.length === 1 ? idExpressions[0] : { $and: idExpressions };
  }
  return filter;
};

const createFailedRecord = ({
  stage,
  recordId,
  message
}: {
  stage: IncrementalMigrationStage;
  recordId: string;
  message: string;
}): SystemMigrationFailedRecord => {
  // 一个文档可能包含大量 Workflow 节点错误；明细只保留有界摘要，避免越过公共 Schema 上限。
  const normalizedMessage = message.slice(0, systemMigrationLimits.maxErrorMessageLength);
  return {
    stageKey: stage.key,
    data: {
      collection: stage.collectionName,
      recordId
    },
    reason: { message: normalizedMessage }
  };
};

const getFailedRecordKey = (record: SystemMigrationFailedRecord) =>
  `${record.stageKey}:${String(record.data.recordId)}`;

/**
 * 执行单条幂等迁移。能安全写入的字段仍会落库；无法解析的字段和 CAS 冲突作为坏数据返回，
 * 因而一个坏文档不会中断当前批次或后续任务。
 */
const processRecord = async ({
  stage,
  record
}: {
  stage: IncrementalMigrationStage;
  record: Record<string, any>;
}): Promise<SystemMigrationFailedRecord | undefined> => {
  const recordId = String(record._id);
  try {
    const result = stage.transform(record);
    let conflict = false;

    if (result.delete) {
      const writeResult = await stage.model.deleteOne(getSnapshotFilter({ record, result }));
      conflict = writeResult.deletedCount !== 1;
    } else if (result.set && Object.keys(result.set).length > 0) {
      const writeResult = await stage.model.updateOne(getSnapshotFilter({ record, result }), {
        $set: result.set
      });
      conflict = writeResult.matchedCount !== 1;
    }

    const messages = [...(result.errors ?? [])];
    if (conflict) messages.push('Record changed concurrently and the compare-and-set write failed');
    if (messages.length === 0) return;

    return createFailedRecord({ stage, recordId, message: messages.join('; ') });
  } catch (error) {
    return createFailedRecord({
      stage,
      recordId,
      message: error instanceof Error ? error.message : String(error)
    });
  }
};

const createInitialCheckpoint = (stages: readonly IncrementalMigrationStage[]) => ({
  version: 1 as const,
  stageIndex: 0,
  stages: stages.map((stage) => ({
    key: stage.key,
    initialized: false,
    endId: null,
    lastId: null,
    processed: 0,
    total: 0
  }))
});

const assertCheckpointMatchesStages = (
  checkpoint: IncrementalCheckpoint,
  stages: readonly IncrementalMigrationStage[]
) => {
  if (
    checkpoint.stages.length !== stages.length ||
    checkpoint.stages.some((item, index) => item.key !== stages[index]?.key)
  ) {
    throw new Error('4163 migration checkpoint does not match the registered stages');
  }
};

const runInChunks = async <T, R>(values: T[], handler: (value: T) => Promise<R>): Promise<R[]> => {
  const results: R[] = [];
  for (let index = 0; index < values.length; index += WRITE_CONCURRENCY) {
    results.push(
      ...(await Promise.all(values.slice(index, index + WRITE_CONCURRENCY).map(handler)))
    );
  }
  return results;
};

/**
 * 4163 非阻塞任务的统一恢复协议：先重试错误快照，再按稳定 endId/lastId 游标续跑。
 * 每批严格按“业务写入 → 完整错误快照 → checkpoint”提交，节点失权后重复执行仍然安全。
 */
export const runIncrementalModelReferenceMigration = async ({
  context,
  stages
}: {
  context: SystemMigrationContext;
  stages: readonly IncrementalMigrationStage[];
}) => {
  let checkpoint =
    (await context.getCheckpoint(IncrementalCheckpointSchema)) ?? createInitialCheckpoint(stages);
  assertCheckpointMatchesStages(checkpoint, stages);

  const failedRecordMap = new Map(
    (await context.getFailedRecords()).map((record) => [getFailedRecordKey(record), record])
  );

  // 管理员重试和 running lease 接管都只重试错误快照中的文档，不回扫已完成区间。
  for (const [stageIndex, stage] of stages.entries()) {
    const failedRecords = [...failedRecordMap.values()].filter(
      (record) => record.stageKey === stage.key
    );
    if (failedRecords.length === 0) continue;

    await context.assertActive();
    const retryResults = await runInChunks(failedRecords, async (failedRecord) => {
      const recordId = String(failedRecord.data.recordId);
      const record = await stage.model
        .findOne({
          ...(stage.query ?? {}),
          _id: recordId
        })
        .lean();
      if (!record) return { failedRecord, next: undefined };
      return { failedRecord, next: await processRecord({ stage, record }) };
    });
    for (const { failedRecord, next } of retryResults) {
      failedRecordMap.delete(getFailedRecordKey(failedRecord));
      if (next) failedRecordMap.set(getFailedRecordKey(next), next);
    }
    await context.reportFailedRecords([...failedRecordMap.values()]);
    context.logger.info('System migration failed records retried', {
      stageKey: stage.key,
      retriedCount: failedRecords.length,
      remainingFailedRecordCount: failedRecordMap.size
    });
    if (
      stageIndex < checkpoint.stageIndex &&
      ![...failedRecordMap.values()].some((record) => record.stageKey === stage.key)
    ) {
      const stageCheckpoint = checkpoint.stages[stageIndex]!;
      await context.reportProgress({
        key: stage.key,
        status: SystemMigrationStatusEnum.succeeded,
        current: stageCheckpoint.total,
        total: stageCheckpoint.total
      });
    }
  }

  for (let stageIndex = checkpoint.stageIndex; stageIndex < stages.length; stageIndex += 1) {
    const stage = stages[stageIndex];
    if (!stage) break;
    let stageCheckpoint = checkpoint.stages[stageIndex]!;

    if (!stageCheckpoint.initialized) {
      const lastRecord = await stage.model
        .findOne(stage.query ?? {})
        .sort({ _id: -1 })
        .select({ _id: 1 })
        .lean();
      const endId = lastRecord ? String(lastRecord._id) : null;
      const total = endId
        ? await stage.model.countDocuments({
            ...(stage.query ?? {}),
            _id: { $lte: endId }
          })
        : 0;
      checkpoint = {
        ...checkpoint,
        stages: checkpoint.stages.map((item, index) =>
          index === stageIndex ? { ...item, initialized: true, endId, total } : item
        )
      };
      stageCheckpoint = checkpoint.stages[stageIndex]!;
      await context.saveCheckpoint(checkpoint);
    }

    await context.reportProgress({
      key: stage.key,
      status: SystemMigrationStatusEnum.running,
      current: stageCheckpoint.processed,
      total: stageCheckpoint.total
    });

    while (stageCheckpoint.endId && stageCheckpoint.lastId !== stageCheckpoint.endId) {
      await context.assertActive();
      const idRange: Record<string, string> = { $lte: stageCheckpoint.endId };
      if (stageCheckpoint.lastId) idRange.$gt = stageCheckpoint.lastId;
      const records = (await stage.model
        .find({ ...(stage.query ?? {}), _id: idRange })
        .sort({ _id: 1 })
        .limit(BATCH_SIZE)
        .lean()) as Record<string, any>[];
      if (records.length === 0) break;

      const results = await runInChunks(records, (record) => processRecord({ stage, record }));
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index]!;
        const key = `${stage.key}:${String(record._id)}`;
        failedRecordMap.delete(key);
        const failedRecord = results[index];
        if (failedRecord) failedRecordMap.set(key, failedRecord);
      }

      stageCheckpoint = {
        ...stageCheckpoint,
        lastId: String(records.at(-1)!._id),
        processed: stageCheckpoint.processed + records.length
      };
      checkpoint = {
        ...checkpoint,
        stages: checkpoint.stages.map((item, index) =>
          index === stageIndex ? stageCheckpoint : item
        )
      };
      // 错误快照先于游标落库，避免节点退出后 checkpoint 越过尚未记录的坏数据。
      await context.reportFailedRecords([...failedRecordMap.values()]);
      await context.saveCheckpoint(checkpoint);
      await context.reportProgress({
        key: stage.key,
        status: SystemMigrationStatusEnum.running,
        current: stageCheckpoint.processed,
        total: stageCheckpoint.total
      });
      context.logger.info('System migration batch completed', {
        stageKey: stage.key,
        batchSize: records.length,
        processed: stageCheckpoint.processed,
        total: stageCheckpoint.total,
        failedRecordCount: failedRecordMap.size
      });
    }

    if (![...failedRecordMap.values()].some((record) => record.stageKey === stage.key)) {
      await context.reportProgress({
        key: stage.key,
        status: SystemMigrationStatusEnum.succeeded,
        current: stageCheckpoint.total,
        total: stageCheckpoint.total
      });
    }

    checkpoint = { ...checkpoint, stageIndex: stageIndex + 1 };
    await context.saveCheckpoint(checkpoint);
  }

  if (failedRecordMap.size > 0) {
    const firstFailedStage = stages.find((stage) =>
      [...failedRecordMap.values()].some((record) => record.stageKey === stage.key)
    );
    if (firstFailedStage) {
      const state = checkpoint.stages.find((item) => item.key === firstFailedStage.key)!;
      await context.reportProgress({
        key: firstFailedStage.key,
        status: SystemMigrationStatusEnum.running,
        current: state.processed,
        total: state.total
      });
    }
    await context.fail({
      message: `${failedRecordMap.size} records still contain unresolved model references`,
      failedRecords: [...failedRecordMap.values()]
    });
  }

  return {
    processedCount: checkpoint.stages.reduce((sum, stage) => sum + stage.processed, 0),
    stageProcessedCounts: Object.fromEntries(
      checkpoint.stages.map((stage) => [stage.key, stage.processed])
    )
  };
};
