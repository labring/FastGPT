import { z } from 'zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationResultData } from '@fastgpt/global/migration/schema';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import {
  buildMemberNameSetOps,
  countMissingMemberNameSet,
  getMemberNameSetSnapshotEnd,
  readMemberNameSetBatch,
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

/**
 * 4.17.1 分批回填：为历史 team_members 补齐 isSetMemberName。
 * owner 始终写入 true；其他成员仅在字段缺失时根据 username 回落规则写入，保证重放幂等。
 */
export const backfillMemberNameSet = async (
  context: SystemMigrationContext
): Promise<SystemMigrationResultData> => {
  await context.reportProgress({ key: 'members', status: SystemMigrationStatusEnum.running });
  await context.assertActive();

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

  const totals = { ownerCount: 0, usernameMatchCount: 0, setTrueCount: 0 };
  for (;;) {
    while (checkpoint.endId && checkpoint.lastId !== checkpoint.endId) {
      context.signal.throwIfAborted();
      await context.assertActive();
      const docs = await readMemberNameSetBatch({
        lastId: checkpoint.lastId,
        endId: checkpoint.endId,
        limit: systemMigrationBatchSize
      });
      if (docs.length === 0) break;

      const userIds = docs.map((doc) => doc.userId).filter(Boolean) as NonNullable<
        (typeof docs)[number]['userId']
      >[];
      const usernameMap = await readUsernameMap(userIds);
      const { ops, counts } = buildMemberNameSetOps({ docs, usernameMap });

      await context.assertActive();
      await writeMemberNameSetBatch({ ops });
      // 补偿扫描可能重复读取已统计文档，避免把 totals 重复累加。
      if (!checkpoint.reconciled) {
        totals.ownerCount += counts.ownerCount;
        totals.usernameMatchCount += counts.usernameMatchCount;
        totals.setTrueCount += counts.setTrueCount;
      }

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

    const latestEndId = await getMemberNameSetSnapshotEnd();
    if (latestEndId && (!checkpoint.endId || latestEndId > checkpoint.endId)) {
      checkpoint = { ...checkpoint, endId: latestEndId, reconciled: false };
      await context.saveCheckpoint(checkpoint);
      continue;
    }

    await context.reportProgress({ key: 'members', status: SystemMigrationStatusEnum.succeeded });
    await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
    await context.assertActive();

    const missingField = await countMissingMemberNameSet();
    if (missingField > 0 && !checkpoint.reconciled) {
      checkpoint = { ...checkpoint, lastId: null, reconciled: true };
      await context.saveCheckpoint(checkpoint);
      continue;
    }
    if (missingField > 0) {
      throw new Error(`Member name backfill left ${missingField} members without isSetMemberName`);
    }

    await context.reportProgress({
      key: 'validation',
      status: SystemMigrationStatusEnum.succeeded
    });
    break;
  }

  return {
    scannedCount: checkpoint.scannedCount,
    ...totals
  };
};
