import { z } from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { IntSchema } from '@fastgpt/global/common/zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import {
  SORT_KEY_BACKFILL_TARGETS,
  backfillNameSortKeyBatch,
  getSortKeyBackfillEntityLabel,
  readNameSortKeyBackfillBatchIds,
  readNameSortKeyBackfillBounds,
  readNameSortKeyValidationBatch,
  type SortKeyBackfillTargetKey
} from './service';

const StageCursorSchema = z.object({
  endId: ObjectIdSchema.nullable(),
  lastId: ObjectIdSchema.nullable(),
  scanned: IntSchema,
  backfilled: IntSchema,
  total: IntSchema,
  completed: z.boolean()
});

const ValidationCursorSchema = z.object({
  lastId: ObjectIdSchema.nullable(),
  scanned: IntSchema,
  completed: z.boolean()
});

const CheckpointSchema = z.object({
  members: StageCursorSchema,
  collections: StageCursorSchema,
  validation: z
    .object({
      members: ValidationCursorSchema,
      collections: ValidationCursorSchema
    })
    .optional()
});

type StageCursor = z.infer<typeof StageCursorSchema>;
type BackfillNameSortKeyCheckpoint = z.infer<typeof CheckpointSchema>;

const initStageCursor = async (target: SortKeyBackfillTargetKey): Promise<StageCursor> => {
  const { endId, total } = await readNameSortKeyBackfillBounds(target);
  return {
    endId,
    lastId: null,
    scanned: 0,
    backfilled: 0,
    total,
    completed: false
  };
};

/**
 * 独立后台分批断点回填存量团队成员与知识库集合的 `nameSortKey`，选用分批断点续跑策略以适配大规模业务表。
 * 依次完成「成员回填 → 集合回填 → 全量完成校验」三阶段；每批固定 `_id` 上界游标推进、CAS 防并发改名覆盖，
 * 且先持久化完整错误快照再保存 checkpoint，支持任意中断后安全重放与自愈。
 */
export const backfillNameSortKey = async (context: SystemMigrationContext) => {
  // 1. 初始化或读取断点，同时固定两张表的 _id 上界与初始总量。
  let checkpoint: BackfillNameSortKeyCheckpoint | undefined =
    await context.getCheckpoint(CheckpointSchema);
  if (!checkpoint) {
    await context.reportProgress({ key: 'members', status: SystemMigrationStatusEnum.running });
    await context.assertActive();
    const [members, collections] = await Promise.all([
      initStageCursor('members'),
      initStageCursor('collections')
    ]);
    checkpoint = { members, collections };
    await context.saveCheckpoint(checkpoint);
  }

  const stageFailures: Record<
    SortKeyBackfillTargetKey,
    Map<string, SystemMigrationFailedRecord>
  > = {
    members: new Map(),
    collections: new Map()
  };
  let validationFailures: SystemMigrationFailedRecord[] = [];
  for (const failure of await context.getFailedRecords()) {
    if (failure.stageKey === 'validation') {
      validationFailures.push(failure);
    } else if (failure.stageKey === 'members' || failure.stageKey === 'collections') {
      stageFailures[failure.stageKey].set(String(failure.data.id), failure);
    }
  }

  const allFailures = (): SystemMigrationFailedRecord[] => [
    ...stageFailures.members.values(),
    ...stageFailures.collections.values(),
    ...validationFailures
  ];

  const runStageBackfill = async (target: SortKeyBackfillTargetKey) => {
    const entityLabel = getSortKeyBackfillEntityLabel(target);
    const failuresMap = stageFailures[target];
    let stage = checkpoint![target];

    await context.reportProgress({
      key: target,
      status: SystemMigrationStatusEnum.running,
      current: stage.scanned,
      total: stage.total
    });

    const processBatch = async (ids: string[]) => {
      context.signal.throwIfAborted();
      await context.assertActive();
      const result = await backfillNameSortKeyBatch({ target, ids });
      for (const id of ids) {
        failuresMap.delete(id);
      }
      for (const [id, message] of result.failures) {
        failuresMap.set(id, {
          stageKey: target,
          data: { id },
          reason: { message: message.slice(0, 500) }
        });
      }
      return result.backfilledCount;
    };

    // 先重试上次遗留的本阶段失败项，以及校验阶段发现属于本目标的异常记录，确保已被游标越过的记录可自愈。
    const retryIds = Array.from(
      new Set([
        ...failuresMap.keys(),
        ...validationFailures
          .filter((failure) => failure.data.target === target)
          .map((failure) => String(failure.data.id))
      ])
    );
    for (let offset = 0; offset < retryIds.length; offset += systemMigrationBatchSize) {
      const batchIds = retryIds.slice(offset, offset + systemMigrationBatchSize);
      const backfilledCount = await processBatch(batchIds);
      const batchIdSet = new Set(batchIds);
      // 已转由本阶段重试的记录移出旧 validation 快照：成功项由后续校验复核，失败项已归属本阶段失败快照，避免同 ID 重复上报。
      validationFailures = validationFailures.filter(
        (failure) => !(failure.data.target === target && batchIdSet.has(String(failure.data.id)))
      );
      stage = {
        ...stage,
        backfilled: stage.backfilled + backfilledCount
      };
      checkpoint = { ...checkpoint!, [target]: stage };
      await context.reportFailedRecords(allFailures());
      await context.saveCheckpoint(checkpoint);
    }

    // 未扫描完时按 _id 升序分批推进至固定上界，确保错误快照先于 checkpoint 持久化。
    while (!stage.completed && stage.endId) {
      context.signal.throwIfAborted();
      await context.assertActive();
      const batchIds = await readNameSortKeyBackfillBatchIds({
        target,
        endId: stage.endId,
        lastId: stage.lastId,
        limit: systemMigrationBatchSize
      });
      if (batchIds.length === 0) break;

      const backfilledCount = await processBatch(batchIds);
      if (failuresMap.size >= systemMigrationBatchSize * 10) {
        await context.fail({
          message: `Too many ${entityLabel.toLowerCase()} sort key backfill failures; inspect records before retrying`,
          failedRecords: allFailures()
        });
      }

      await context.reportFailedRecords(allFailures());
      const nextScanned = stage.scanned + batchIds.length;
      stage = {
        ...stage,
        lastId: batchIds.at(-1)!,
        scanned: nextScanned,
        backfilled: stage.backfilled + backfilledCount,
        total: Math.max(stage.total, nextScanned)
      };
      checkpoint = { ...checkpoint!, [target]: stage };
      await context.saveCheckpoint(checkpoint);
      await context.reportProgress({
        key: target,
        status: SystemMigrationStatusEnum.running,
        current: stage.scanned,
        total: stage.total
      });
    }

    if (failuresMap.size > 0) {
      await context.fail({
        message: `Some ${entityLabel.toLowerCase()} records failed to backfill nameSortKey; retry after resolving conflicts`,
        failedRecords: allFailures()
      });
    }

    if (!stage.completed || stage.total !== stage.scanned) {
      stage = { ...stage, total: stage.scanned, completed: true };
      checkpoint = { ...checkpoint!, [target]: stage };
      await context.saveCheckpoint(checkpoint);
    }

    await context.reportProgress({
      key: target,
      status: SystemMigrationStatusEnum.succeeded,
      current: stage.scanned,
      total: stage.total
    });
  };

  // 2. 依次执行成员回填与知识库集合回填。
  for (const target of SORT_KEY_BACKFILL_TARGETS) {
    await runStageBackfill(target);
  }

  // 3. 完成校验：按 _id 升序独立分批核验两张表在固定上界内所有记录均合法且与 name 一致。
  const validation = (checkpoint.validation ??= {
    members: { lastId: null, scanned: 0, completed: false },
    collections: { lastId: null, scanned: 0, completed: false }
  });
  const totalExpected = checkpoint.members.total + checkpoint.collections.total;
  const totalValidated = () => validation.members.scanned + validation.collections.scanned;

  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.running,
    current: totalValidated(),
    total: Math.max(totalExpected, totalValidated())
  });

  for (const target of SORT_KEY_BACKFILL_TARGETS) {
    const entityLabel = getSortKeyBackfillEntityLabel(target);
    const endId = checkpoint[target].endId;
    const cursor = validation[target];

    while (!cursor.completed && endId) {
      context.signal.throwIfAborted();
      await context.assertActive();
      const batch = await readNameSortKeyValidationBatch({
        target,
        endId,
        lastId: cursor.lastId,
        limit: systemMigrationBatchSize
      });
      if (batch.scanned === 0) break;

      if (batch.invalidIds.length > 0) {
        const invalidRecords: SystemMigrationFailedRecord[] = batch.invalidIds.map((id) => ({
          stageKey: 'validation',
          data: { target, id },
          reason: {
            message: `${entityLabel} nameSortKey is missing or out of sync with name; retry required`
          }
        }));
        // 整批通过后才推进校验游标，失败重试会按 target 先补写异常记录再重新校验该批。
        await context.fail({
          message: `${entityLabel} nameSortKey backfill validation failed`,
          failedRecords: invalidRecords
        });
      }

      cursor.lastId = batch.lastId;
      cursor.scanned += batch.scanned;
      checkpoint = {
        ...checkpoint,
        validation: {
          members: { ...validation.members },
          collections: { ...validation.collections }
        }
      };
      await context.saveCheckpoint(checkpoint);
      await context.reportProgress({
        key: 'validation',
        status: SystemMigrationStatusEnum.running,
        current: totalValidated(),
        total: Math.max(totalExpected, totalValidated())
      });
    }

    if (!cursor.completed) {
      cursor.completed = true;
      checkpoint = {
        ...checkpoint,
        validation: {
          members: { ...validation.members },
          collections: { ...validation.collections }
        }
      };
      await context.saveCheckpoint(checkpoint);
    }
  }

  if (validationFailures.length > 0) {
    validationFailures = [];
    await context.reportFailedRecords([]);
  }

  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.succeeded,
    current: totalValidated(),
    total: Math.max(totalExpected, totalValidated())
  });

  return {
    memberScannedCount: checkpoint.members.scanned,
    memberBackfilledCount: checkpoint.members.backfilled,
    collectionScannedCount: checkpoint.collections.scanned,
    collectionBackfilledCount: checkpoint.collections.backfilled
  };
};
