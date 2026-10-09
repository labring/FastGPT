import { z } from 'zod';
import {
  systemMigrationLimits,
  SystemMigrationStatusEnum
} from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import {
  backfillSandboxTeamIdBatch,
  countMissingTeamId,
  getSandboxTeamIdSnapshotEnd,
  readSandboxTeamIdBatch,
  readSandboxTeamIdRecord,
  type SandboxTeamIdRecord
} from './service';

const CursorSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/)
  .nullable();
const CheckpointSchema = z
  .object({
    version: z.literal(1),
    endId: CursorSchema,
    lastId: CursorSchema,
    scannedCount: z.number().int().nonnegative(),
    backfilledCount: z.number().int().nonnegative(),
    orphanCount: z.number().int().nonnegative()
  })
  .refine(({ endId, lastId }) => !lastId || (!!endId && lastId <= endId));

const FAILED_STAGE_KEY = 'instances';

/**
 * 4.17.1 分批回填：为历史 sandbox 实例补齐团队归属 teamId。
 *
 * 恢复策略为「分批断点续跑」：checkpoint 只保存 ObjectId 游标与累计计数；每批写入使用
 * 携带「仍缺 teamId」条件的 CAS bulkWrite，可安全重放。源已删除的孤儿记录只跳过并计数；
 * 源 ID 无效或源存在但缺少 teamId 的记录进入失败快照，由管理员修复后重试。
 * 每轮扫描上界固定为「当前仍缺失 teamId 的最大 _id」，回填推进后上界自然收敛；
 * 滚动升级期间旧节点写入的新缺失记录会扩大上界并被追加扫描。
 */
export const backfillAgentSandboxTeamId = async (context: SystemMigrationContext) => {
  await context.reportProgress({ key: 'instances', status: SystemMigrationStatusEnum.running });
  await context.assertActive();

  let checkpoint = await context.getCheckpoint(CheckpointSchema);
  if (!checkpoint) {
    checkpoint = {
      version: 1,
      endId: await getSandboxTeamIdSnapshotEnd(),
      lastId: null,
      scannedCount: 0,
      backfilledCount: 0,
      orphanCount: 0
    };
    await context.saveCheckpoint(checkpoint);
  }

  const failedRecordMap = new Map<string, SystemMigrationFailedRecord>(
    (await context.getFailedRecords())
      .filter((record) => record.stageKey === FAILED_STAGE_KEY)
      .map((record) => [String(record.data.recordId), record])
  );

  /** 按回填结局更新失败快照与计数；孤儿只跳过，不计失败也不报错。 */
  const processBatch = async (records: SandboxTeamIdRecord[]) => {
    if (records.length === 0) return { backfilled: 0, orphan: 0 };

    const outcomes = await backfillSandboxTeamIdBatch(records);
    const outcomeById = new Map(outcomes.map((outcome) => [outcome.recordId, outcome]));
    let backfilled = 0;
    let orphan = 0;

    for (const record of records) {
      const recordId = String(record._id);
      failedRecordMap.delete(recordId);
      const outcome = outcomeById.get(recordId);
      if (outcome?.status === 'migrated') {
        backfilled += 1;
      } else if (outcome?.status === 'invalid' || outcome?.status === 'invalidSourceId') {
        failedRecordMap.set(recordId, {
          stageKey: FAILED_STAGE_KEY,
          data: {
            recordId,
            sourceType: record.sourceType,
            sourceId: record.sourceId
          },
          reason: {
            message: (outcome.status === 'invalidSourceId'
              ? 'Sandbox sourceId is not a valid ObjectId'
              : 'Sandbox source exists without teamId'
            ).slice(0, systemMigrationLimits.maxErrorMessageLength)
          }
        });
      } else {
        orphan += 1;
      }
    }

    await context.reportFailedRecords([...failedRecordMap.values()]);
    return { backfilled, orphan };
  };

  // 上次失败快照先重试：source 可能已被管理员修复；已被并发补齐的记录直接移出快照。
  const previousFailures = [...failedRecordMap.values()];
  for (let index = 0; index < previousFailures.length; index += systemMigrationBatchSize) {
    await context.assertActive();
    const slice = previousFailures.slice(index, index + systemMigrationBatchSize);
    const reread = await Promise.all(
      slice.map((failed) => readSandboxTeamIdRecord(String(failed.data.recordId)))
    );
    reread.forEach((record, position) => {
      if (!record) failedRecordMap.delete(String(slice[position].data.recordId));
    });
    const retryRecords = reread.filter((record): record is SandboxTeamIdRecord => Boolean(record));
    const { backfilled, orphan } = await processBatch(retryRecords);
    checkpoint = {
      ...checkpoint,
      backfilledCount: checkpoint.backfilledCount + backfilled,
      orphanCount: checkpoint.orphanCount + orphan
    };
    await context.saveCheckpoint(checkpoint);
  }

  for (;;) {
    while (checkpoint.endId && checkpoint.lastId !== checkpoint.endId) {
      context.signal.throwIfAborted();
      await context.assertActive();
      const records = await readSandboxTeamIdBatch({
        lastId: checkpoint.lastId,
        endId: checkpoint.endId,
        limit: systemMigrationBatchSize
      });
      if (records.length === 0) break;

      const { backfilled, orphan } = await processBatch(records);
      await context.assertActive();
      checkpoint = {
        ...checkpoint,
        lastId: String(records.at(-1)!._id),
        scannedCount: checkpoint.scannedCount + records.length,
        backfilledCount: checkpoint.backfilledCount + backfilled,
        orphanCount: checkpoint.orphanCount + orphan
      };
      await context.saveCheckpoint(checkpoint);
      await context.reportProgress({
        key: 'instances',
        status: SystemMigrationStatusEnum.running,
        current: checkpoint.scannedCount
      });
    }

    // 尾补：滚动升级期间旧节点写入的新缺失记录会把上界推高，扩展后继续扫描。
    const latestEndId = await getSandboxTeamIdSnapshotEnd();
    if (latestEndId && (!checkpoint.endId || latestEndId > checkpoint.endId)) {
      checkpoint = { ...checkpoint, endId: latestEndId };
      await context.saveCheckpoint(checkpoint);
      continue;
    }

    await context.reportProgress({ key: 'instances', status: SystemMigrationStatusEnum.succeeded });
    await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
    await context.assertActive();

    if (failedRecordMap.size > 0) {
      await context.fail({
        message: `${failedRecordMap.size} sandbox instances have invalid sourceId or missing source teamId`,
        failedRecords: [...failedRecordMap.values()]
      });
    }

    // 剩余缺失记录只可能是源已删除的孤儿（不可回填），记录数量供管理员核对。
    const remainingMissingCount = await countMissingTeamId();
    context.logger.info('Sandbox teamId backfill completed', {
      scannedCount: checkpoint.scannedCount,
      backfilledCount: checkpoint.backfilledCount,
      orphanCount: checkpoint.orphanCount,
      remainingMissingCount
    });

    await context.reportProgress({
      key: 'validation',
      status: SystemMigrationStatusEnum.succeeded
    });
    break;
  }

  return {
    scannedCount: checkpoint.scannedCount,
    backfilledCount: checkpoint.backfilledCount,
    orphanCount: checkpoint.orphanCount
  };
};
