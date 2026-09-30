import { z } from 'zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationResultData
} from '@fastgpt/global/migration/schema';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import type { Types } from '@fastgpt/service/common/mongo';
import {
  buildMemberNameSetOps,
  countMissingMemberNameSet,
  countPlaceholderMemberNames,
  getMemberNameSetSnapshotEnd,
  MEMBER_NAME_SET_STAGE_KEY,
  orphanToFailedRecord,
  readMemberNameSetBatch,
  readMemberNameSetDocsByIds,
  readUsernameMap,
  writeMemberNameSetBatch
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
    reconciled: z.boolean().default(false)
  })
  .refine(({ endId, lastId }) => !lastId || (!!endId && lastId <= endId));

/** 从失败明细恢复待重试的孤儿记录，只认本任务阶段的成员 ID。 */
const restoreOrphanRecords = (failedRecords: SystemMigrationFailedRecord[]) =>
  failedRecords.flatMap((record) => {
    if (record.stageKey !== MEMBER_NAME_SET_STAGE_KEY) return [];
    const tmbId = typeof record.data.tmbId === 'string' ? record.data.tmbId : '';
    if (!/^[a-f0-9]{24}$/.test(tmbId)) return [];
    return [{ key: tmbId, record }];
  });

/**
 * 4.17.1 阻塞式回填：为 team_members 补齐 isSetMemberName，并清理占位符成员名。
 * 新代码对迁移前数据完全兼容（读取侧按占位符推断 + 展示名收敛），但为避免迁移未完成时暴露旧占位符而阻塞启动；
 * team_members 在同步模式部署可能较大，采用 ObjectId 游标分批断点续跑，并在尾部扩展后做一次全量补偿扫描；
 * 占位符回落与字段回填的过滤条件都携带当前状态，批次重放幂等；
 * 孤儿占位符文档（用户缺失/用户名空）跳过并按 tmbId 增量维护失败明细，管理员修复后重试。
 */
export const backfillMemberNameSet = async (
  context: SystemMigrationContext
): Promise<SystemMigrationResultData> => {
  await context.reportProgress({ key: 'members', status: SystemMigrationStatusEnum.running });
  await context.assertActive();

  const previousFailedRecords = restoreOrphanRecords(await context.getFailedRecords());
  const totals = { placeholderCount: 0, usernameMatchCount: 0, setTrueCount: 0 };

  /** 重试上一轮失败的成员，修复成功后只删除对应失败明细。 */
  const retryOrphans = async (records: typeof previousFailedRecords) => {
    for (let offset = 0; offset < records.length; offset += systemMigrationBatchSize) {
      const batch = records.slice(offset, offset + systemMigrationBatchSize);
      await context.assertActive();
      const docs = await readMemberNameSetDocsByIds(batch.map(({ key }) => key));
      const userIds = docs.map((doc) => doc.userId).filter(Boolean) as Types.ObjectId[];
      const usernameMap = await readUsernameMap(userIds);
      const { ops, orphans, counts } = buildMemberNameSetOps({ docs, usernameMap });
      await context.assertActive();
      await writeMemberNameSetBatch({ ops });

      const unresolvedIds = new Set(orphans.map((orphan) => orphan.tmbId));
      const removals = batch
        .filter(({ key }) => !unresolvedIds.has(key))
        .map(({ record }) => ({ stageKey: record.stageKey, key: String(record.data.tmbId) }));
      const upserts = orphans.map((orphan) => ({
        key: orphan.tmbId,
        record: orphanToFailedRecord(orphan)
      }));
      if (removals.length > 0) await context.removeFailedRecords(removals);
      if (upserts.length > 0) await context.upsertFailedRecords(upserts);
      totals.placeholderCount += counts.placeholderCount;
      totals.usernameMatchCount += counts.usernameMatchCount;
      totals.setTrueCount += counts.setTrueCount;
    }
  };

  await retryOrphans(previousFailedRecords);

  let checkpoint = await context.getCheckpoint(CheckpointSchema);
  if (!checkpoint) {
    checkpoint = {
      version: 1,
      endId: await getMemberNameSetSnapshotEnd(),
      lastId: null,
      scannedCount: 0,
      reconciled: false
    };
    await context.saveCheckpoint(checkpoint);
  }

  while (checkpoint.endId && checkpoint.lastId !== checkpoint.endId) {
    context.signal.throwIfAborted();
    await context.assertActive();
    const docs = await readMemberNameSetBatch({
      lastId: checkpoint.lastId,
      endId: checkpoint.endId,
      limit: systemMigrationBatchSize
    });
    if (docs.length === 0) break;

    const userIds = docs.map((doc) => doc.userId).filter(Boolean) as Types.ObjectId[];
    const usernameMap = await readUsernameMap(userIds);
    const { ops, orphans, counts } = buildMemberNameSetOps({ docs, usernameMap });

    await context.assertActive();
    await writeMemberNameSetBatch({ ops });

    const orphanRecords = orphans.map((orphan) => ({
      key: orphan.tmbId,
      record: orphanToFailedRecord(orphan)
    }));
    if (orphanRecords.length > 0) await context.upsertFailedRecords(orphanRecords);
    totals.placeholderCount += counts.placeholderCount;
    totals.usernameMatchCount += counts.usernameMatchCount;
    totals.setTrueCount += counts.setTrueCount;
    await context.assertActive();
    checkpoint = {
      ...checkpoint,
      lastId: String(docs.at(-1)!._id),
      scannedCount: checkpoint.scannedCount + docs.length
    };
    await context.saveCheckpoint(checkpoint);
    await context.reportProgress({
      key: 'members',
      status: SystemMigrationStatusEnum.running,
      current: checkpoint.scannedCount
    });
  }

  await context.reportProgress({
    key: 'members',
    status: SystemMigrationStatusEnum.succeeded,
    current: checkpoint.scannedCount
  });

  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
  await context.assertActive();

  const latestEndId = await getMemberNameSetSnapshotEnd();
  if (latestEndId && (!checkpoint.endId || latestEndId > checkpoint.endId)) {
    checkpoint = { ...checkpoint, endId: latestEndId, reconciled: false };
    await context.saveCheckpoint(checkpoint);
    return backfillMemberNameSet(context);
  }

  const [remainingPlaceholders, missingField] = await Promise.all([
    countPlaceholderMemberNames(),
    countMissingMemberNameSet()
  ]);
  if ((remainingPlaceholders > 0 || missingField > 0) && !checkpoint.reconciled) {
    // 旧节点可能在首轮扫描后改写已有文档；重置游标做一次全量补偿扫描。
    checkpoint = {
      ...checkpoint,
      lastId: null,
      scannedCount: 0,
      reconciled: true
    };
    await context.saveCheckpoint(checkpoint);
    return backfillMemberNameSet(context);
  }

  const failedRecords = await context.getFailedRecords();
  if (remainingPlaceholders > 0 || missingField > 0 || failedRecords.length > 0) {
    await context.fail({
      message: `Member name backfill left ${remainingPlaceholders} placeholders, ${missingField} missing flags and ${failedRecords.length} failed records`
    });
  }

  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.succeeded });

  return {
    scannedCount: checkpoint.scannedCount,
    ...totals,
    orphanCount: failedRecords.length
  };
};
