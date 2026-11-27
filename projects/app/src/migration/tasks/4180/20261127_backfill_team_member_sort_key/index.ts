import { z } from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { IntSchema } from '@fastgpt/global/common/zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { backfillTeamMemberSortKeyBatch, readTeamMemberSortKeyValidationBatch } from './service';

const ValidationCursorSchema = z.object({
  lastId: ObjectIdSchema.nullable(),
  scanned: IntSchema
});

const CheckpointSchema = z.object({
  endId: ObjectIdSchema.nullable(),
  lastId: ObjectIdSchema.nullable(),
  scanned: IntSchema,
  backfilled: IntSchema,
  total: IntSchema,
  validation: ValidationCursorSchema.optional()
});

type BackfillTeamMemberSortKeyCheckpoint = z.infer<typeof CheckpointSchema>;

/**
 * 独立后台分批断点回填所有存量团队成员的 `nameSortKey`，选用分批断点续跑策略以适配大规模团队成员表。
 * 固定 `_id` 上界 + 游标分页可安全重放；每批在 `saveCheckpoint` 前先持久化完整错误快照，
 * 并在回填结束后独立扫描校验所有记录与当前 `name` 保持一致。
 */
export const backfillTeamMemberSortKey = async (context: SystemMigrationContext) => {
  const collection = MongoTeamMember.collection;

  // 1. 初始化或读取断点，固定本次回填扫描的 _id 上界与初始总量。
  await context.reportProgress({ key: 'members', status: SystemMigrationStatusEnum.running });
  let checkpoint: BackfillTeamMemberSortKeyCheckpoint | undefined =
    await context.getCheckpoint(CheckpointSchema);
  if (!checkpoint) {
    await context.assertActive();
    const last = await collection.findOne({}, { projection: { _id: 1 }, sort: { _id: -1 } });
    const endId = last ? String(last._id) : null;
    const total = endId
      ? await collection.countDocuments({ _id: { $lte: new Types.ObjectId(endId) } })
      : 0;
    checkpoint = {
      endId,
      lastId: null,
      scanned: 0,
      backfilled: 0,
      total
    };
    await context.saveCheckpoint(checkpoint);
  }

  const memberFailures = new Map<string, SystemMigrationFailedRecord>();
  let validationFailures: SystemMigrationFailedRecord[] = [];
  for (const failure of await context.getFailedRecords()) {
    if (failure.stageKey === 'validation') {
      validationFailures.push(failure);
    } else {
      memberFailures.set(String(failure.data.id), failure);
    }
  }

  const processBatch = async (ids: string[]) => {
    context.signal.throwIfAborted();
    await context.assertActive();
    const result = await backfillTeamMemberSortKeyBatch(ids);
    for (const id of ids) {
      memberFailures.delete(id);
    }
    for (const [id, message] of result.failures) {
      memberFailures.set(id, {
        stageKey: 'members',
        data: { id },
        reason: { message: message.slice(0, 500) }
      });
    }
    return result.backfilledCount;
  };

  // 2. 先重试上次遗留的回填失败项以及上次校验发现的异常记录，避免已被游标越过的记录无法自愈。
  await context.reportProgress({
    key: 'members',
    status: SystemMigrationStatusEnum.running,
    current: checkpoint.scanned,
    total: checkpoint.total
  });
  const retryIds = Array.from(
    new Set([
      ...memberFailures.keys(),
      ...validationFailures.map((failure) => String(failure.data.id))
    ])
  );
  for (let offset = 0; offset < retryIds.length; offset += systemMigrationBatchSize) {
    const batchIds = retryIds.slice(offset, offset + systemMigrationBatchSize);
    const backfilledCount = await processBatch(batchIds);
    checkpoint = {
      ...checkpoint,
      backfilled: checkpoint.backfilled + backfilledCount
    };
    await context.reportFailedRecords([...memberFailures.values(), ...validationFailures]);
    await context.saveCheckpoint(checkpoint);
  }

  // 3. 按 _id 升序分批扫描并回填至固定上界，确保错误快照先于 checkpoint 持久化。
  while (checkpoint.endId) {
    context.signal.throwIfAborted();
    await context.assertActive();
    const records = await collection
      .find(
        {
          _id: {
            $lte: new Types.ObjectId(checkpoint.endId),
            ...(checkpoint.lastId ? { $gt: new Types.ObjectId(checkpoint.lastId) } : {})
          }
        },
        { projection: { _id: 1 } }
      )
      .sort({ _id: 1 })
      .limit(systemMigrationBatchSize)
      .toArray();
    if (records.length === 0) break;

    const backfilledCount = await processBatch(records.map((record) => String(record._id)));
    if (memberFailures.size >= systemMigrationBatchSize * 10) {
      await context.fail({
        message: 'Too many team member sort key backfill failures; inspect records before retrying',
        failedRecords: [...memberFailures.values(), ...validationFailures]
      });
    }

    await context.reportFailedRecords([...memberFailures.values(), ...validationFailures]);
    const nextScanned: number = checkpoint.scanned + records.length;
    checkpoint = {
      ...checkpoint,
      lastId: String(records.at(-1)!._id),
      scanned: nextScanned,
      backfilled: checkpoint.backfilled + backfilledCount,
      total: Math.max(checkpoint.total, nextScanned)
    };
    await context.saveCheckpoint(checkpoint);
    await context.reportProgress({
      key: 'members',
      status: SystemMigrationStatusEnum.running,
      current: checkpoint.scanned,
      total: checkpoint.total
    });
  }

  if (checkpoint.total !== checkpoint.scanned) {
    checkpoint = { ...checkpoint, total: checkpoint.scanned };
    await context.saveCheckpoint(checkpoint);
  }

  if (memberFailures.size > 0) {
    await context.fail({
      message: 'Some team members failed to backfill nameSortKey; retry after resolving conflicts',
      failedRecords: [...memberFailures.values(), ...validationFailures]
    });
  }

  await context.reportProgress({
    key: 'members',
    status: SystemMigrationStatusEnum.succeeded,
    current: checkpoint.scanned,
    total: checkpoint.total
  });

  // 4. 完成校验：独立按 _id 分批核验所有记录的 nameSortKey 合法且与当前 name 一致。
  const validation = (checkpoint.validation ??= { lastId: null, scanned: 0 });
  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.running,
    current: validation.scanned,
    total: checkpoint.total
  });

  while (checkpoint.endId) {
    context.signal.throwIfAborted();
    await context.assertActive();
    const batch = await readTeamMemberSortKeyValidationBatch({
      endId: checkpoint.endId,
      lastId: validation.lastId,
      limit: systemMigrationBatchSize
    });
    if (batch.scanned === 0) break;

    if (batch.invalidIds.length > 0) {
      const invalidRecords: SystemMigrationFailedRecord[] = batch.invalidIds.map((id) => ({
        stageKey: 'validation',
        data: { id },
        reason: {
          message: 'Team member nameSortKey is missing or out of sync with name; retry required'
        }
      }));
      // 整批通过后才推进校验游标，失败重试会先补写这些记录再重新校验该批。
      await context.fail({
        message: 'Team member nameSortKey backfill validation failed',
        failedRecords: invalidRecords
      });
    }

    validation.lastId = batch.lastId;
    validation.scanned += batch.scanned;
    checkpoint = {
      ...checkpoint,
      validation: { ...validation },
      total: Math.max(checkpoint.total, validation.scanned)
    };
    await context.saveCheckpoint(checkpoint);
    await context.reportProgress({
      key: 'validation',
      status: SystemMigrationStatusEnum.running,
      current: validation.scanned,
      total: checkpoint.total
    });
  }

  if (validationFailures.length > 0) {
    validationFailures = [];
    await context.reportFailedRecords([]);
  }

  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.succeeded,
    current: validation.scanned,
    total: Math.max(checkpoint.total, validation.scanned)
  });

  return {
    scannedCount: checkpoint.scanned,
    backfilledCount: checkpoint.backfilled
  };
};
