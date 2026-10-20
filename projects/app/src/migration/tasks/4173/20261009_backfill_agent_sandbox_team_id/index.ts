import { z } from 'zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { backfillSandboxTeamIdBatch, resolveSandboxTeamIdBatch } from './service';
import {
  getSandboxTeamIdSnapshotEnd,
  readSandboxTeamIdBatch,
  readSandboxTeamIdRecord,
  type SandboxTeamIdRecord
} from './entity';

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
    reconciled: z.boolean()
  })
  .refine(({ endId, lastId }) => !lastId || (!!endId && lastId <= endId));

/**
 * 分批 CAS 回填历史沙箱的 teamId：先续跑固定范围，再从头补扫一次，最后只读校验。
 * checkpoint 记录当前轮次和批次游标，业务提交、失败快照持久化后才推进；重试优先修复旧失败。
 * 可解析但仍缺归属的记录使校验失败，并重置扫描范围供管理员重试；孤儿只统计，不阻断。
 * scannedCount 为累计扫描条次，backfilledCount 为回填尝试数，orphanCount 为最终校验的孤儿数。
 * 成功只覆盖最终校验快照，之后旧节点的新写入仍由运行期惰性补齐，不无限追赶并发写入。
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
      reconciled: false
    };
    await context.saveCheckpoint(checkpoint);
  }

  const failedRecordMap = new Map<string, SystemMigrationFailedRecord>(
    (await context.getFailedRecords()).map((record) => [String(record.data.recordId), record])
  );

  /** 更新完整错误快照；校验时可解析但仍未回填的记录也必须报告为遗漏。 */
  const reportOutcomes = async (
    outcomes: Awaited<ReturnType<typeof resolveSandboxTeamIdBatch>>,
    validating = false
  ) => {
    for (const outcome of outcomes) {
      const { record, status } = outcome;
      const recordId = String(record._id);
      failedRecordMap.delete(recordId);
      const message = (() => {
        if (status === 'invalidSourceId') return 'Sandbox sourceId is not a valid ObjectId';
        if (status === 'invalid') return 'Sandbox source exists without teamId';
        if (status === 'resolved' && validating)
          return 'Sandbox teamId is still missing after backfill';
        return undefined;
      })();
      if (message) {
        failedRecordMap.set(recordId, {
          stageKey: validating ? 'validation' : 'instances',
          data: { recordId, sourceType: record.sourceType, sourceId: record.sourceId },
          reason: { message }
        });
      }
    }
    await context.reportFailedRecords([...failedRecordMap.values()]);
  };

  /** 提交回填和完整失败快照后返回计数，调用方再推进断点。 */
  const processBatch = async (records: SandboxTeamIdRecord[]) => {
    const outcomes = await backfillSandboxTeamIdBatch(records);
    await reportOutcomes(outcomes);
    return outcomes.filter((outcome) => outcome.status === 'resolved').length;
  };

  // 先重试旧失败；已被业务补齐或删除的记录也要从持久失败快照中移除。
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
    const backfilled = await processBatch(
      reread.filter((record): record is SandboxTeamIdRecord => record !== null)
    );
    checkpoint = { ...checkpoint, backfilledCount: checkpoint.backfilledCount + backfilled };
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

      const backfilled = await processBatch(records);
      await context.assertActive();
      checkpoint = {
        ...checkpoint,
        lastId: String(records.at(-1)!._id),
        scannedCount: checkpoint.scannedCount + records.length,
        backfilledCount: checkpoint.backfilledCount + backfilled
      };
      await context.saveCheckpoint(checkpoint);
      await context.reportProgress({
        key: 'instances',
        status: SystemMigrationStatusEnum.running,
        current: checkpoint.scannedCount
      });
    }

    if (checkpoint.reconciled) break;
    // 只补扫一轮：重新取上界并从头开始，同时覆盖迟到的较小 ID 和新增的较大 ID。
    await context.assertActive();
    checkpoint = {
      ...checkpoint,
      endId: await getSandboxTeamIdSnapshotEnd(),
      lastId: null,
      reconciled: true
    };
    await context.saveCheckpoint(checkpoint);
  }

  await context.reportProgress({ key: 'instances', status: SystemMigrationStatusEnum.succeeded });
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });

  // 从头校验新的固定快照，复用来源分类且不再写入；不把孤儿误报为可修复遗漏。
  await context.assertActive();
  const validationEndId = await getSandboxTeamIdSnapshotEnd();
  let lastId: string | null = null;
  let orphanCount = 0;
  while (validationEndId && lastId !== validationEndId) {
    context.signal.throwIfAborted();
    await context.assertActive();
    const records = await readSandboxTeamIdBatch({
      lastId,
      endId: validationEndId,
      limit: systemMigrationBatchSize
    });
    if (records.length === 0) break;
    const outcomes = await resolveSandboxTeamIdBatch(records);
    orphanCount += outcomes.filter((outcome) => outcome.status === 'orphan').length;
    await reportOutcomes(outcomes, true);
    lastId = String(records.at(-1)!._id);
  }

  if (failedRecordMap.size > 0) {
    await context.assertActive();
    checkpoint = {
      ...checkpoint,
      endId: await getSandboxTeamIdSnapshotEnd(),
      lastId: null,
      reconciled: false
    };
    await context.saveCheckpoint(checkpoint);
    await context.fail({
      message: `${failedRecordMap.size} sandbox instances still need teamId backfill or source repair`,
      failedRecords: [...failedRecordMap.values()]
    });
  }

  const result = {
    scannedCount: checkpoint.scannedCount,
    backfilledCount: checkpoint.backfilledCount,
    orphanCount
  };
  context.logger.info('Sandbox teamId backfill completed', result);
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.succeeded });
  return result;
};
