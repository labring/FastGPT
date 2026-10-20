import { z } from 'zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { systemMigrationBatchSize } from '@/migration/constants';
import {
  countRemainingRebuildStatuses,
  getRebuildStatusEndId,
  migrateRebuildStatusBatch,
  readRebuildStatusBatch
} from './service';

const CursorSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/)
  .nullable();
const CheckpointSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  stage: z.enum(['datas', 'trainings']),
  endId: CursorSchema,
  lastId: CursorSchema,
  current: z.number().int().nonnegative()
});

/**
 * 手动分批断点迁移；必须在所有旧 App/Pro 停止读写 rebuilding、完成 chunk 迁移后执行。
 * 先转换旧标记，再依据仍存在的 training 恢复进行中/失败状态，每批事务提交后保存断点。
 * 清理旧字段已获本次需求授权；失败只保留已提交批次，通过幂等重放继续，不回退新状态。
 */
export const migrateDatasetRebuildStatus = async (context: SystemMigrationContext) => {
  let checkpoint = await context.getCheckpoint(CheckpointSchema);
  // v2 增加任务类型拆分；旧断点必须重扫，幂等批次不会回退已经转换的状态。
  if (checkpoint?.version === 1) checkpoint = undefined;
  for (const stage of ['datas', 'trainings'] as const) {
    await context.reportProgress({ key: stage, status: SystemMigrationStatusEnum.running });
    if (stage === 'datas' && checkpoint?.stage === 'trainings') {
      await context.reportProgress({ key: stage, status: SystemMigrationStatusEnum.succeeded });
      continue;
    }
    await context.assertActive();
    if (checkpoint?.stage !== stage || !checkpoint.endId) {
      checkpoint = {
        version: 2,
        stage,
        endId: await getRebuildStatusEndId(stage),
        lastId: null,
        current: 0
      };
      await context.saveCheckpoint(checkpoint);
    }
    while (checkpoint.endId) {
      context.signal.throwIfAborted();
      await context.assertActive();
      const batch = await readRebuildStatusBatch({
        ...checkpoint,
        endId: checkpoint.endId,
        limit: systemMigrationBatchSize
      });
      if (!batch.length) break;
      await migrateRebuildStatusBatch({ stage, ids: batch.map(({ _id }) => _id) });
      checkpoint.lastId = String(batch[batch.length - 1]._id);
      checkpoint.current += batch.length;
      await context.saveCheckpoint(checkpoint);
      await context.reportProgress({
        key: stage,
        status: SystemMigrationStatusEnum.running,
        current: checkpoint.current
      });
    }
    await context.reportProgress({
      key: stage,
      status: SystemMigrationStatusEnum.succeeded,
      current: checkpoint.current
    });
  }
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
  await context.assertActive();
  const remainingCount = await countRemainingRebuildStatuses();
  if (remainingCount) {
    // 重置扫描窗口；遗漏的旧节点停掉后，重试也可处理前一个窗口之外的写入。
    await context.saveCheckpoint({
      version: 2,
      stage: 'datas',
      endId: null,
      lastId: null,
      current: 0
    });
    await context.fail({
      message: `${remainingCount} legacy rebuild statuses remain; stop old workers before retrying`
    });
  }
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.succeeded });
  return { remainingCount };
};
