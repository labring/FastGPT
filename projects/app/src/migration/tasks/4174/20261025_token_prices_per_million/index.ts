import { z } from 'zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { systemMigrationBatchSize } from '@/migration/constants';
import {
  getTokenPriceMigrationSnapshot,
  readTokenPriceMigrationBatch,
  readFailedTokenPriceMigrationRecords,
  migrateTokenPricesBatch,
  validateTokenPricesBatch,
  type TokenPriceMigrationError
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
    total: z.number().int().nonnegative()
  })
  .refine(({ endId, lastId }) => lastId === null || (endId !== null && lastId <= endId));

/**
 * 非阻塞后台任务：按稳定游标分批转换全部 Token/TTS 旧价格，STT 保持原样。
 * 只在整批成功后推进断点；坏数据停止本次执行并记录明细，管理员修复后重试续跑。
 * 原价备份保护事务提交后、checkpoint 前的重放；返回前重新全量只读校验。
 */
export const migrateTokenPricesPerMillion = async (context: SystemMigrationContext) => {
  await context.reportProgress({ key: 'models', status: SystemMigrationStatusEnum.running });
  await context.assertActive();
  let checkpoint = await context.getCheckpoint(CheckpointSchema);
  if (!checkpoint) {
    const snapshot = await getTokenPriceMigrationSnapshot();
    checkpoint = { version: 1, ...snapshot, lastId: null, scannedCount: 0 };
    await context.saveCheckpoint(checkpoint);
  }

  const failedRecords = new Map(
    (await context.getFailedRecords()).map((record) => [String(record.data.modelId), record])
  );

  /** 保留尚未重试的旧错误并替换本批错误，保证管理页始终能定位全部已知失败项。 */
  const assertNoErrors = async (
    errors: TokenPriceMigrationError[],
    stageKey: 'models' | 'validation'
  ) => {
    const first = errors[0];
    if (!first) return;
    context.logger.error('Model pricing migration requires source repair', {
      errorCount: errors.length,
      modelId: first.id,
      reason: first.reason
    });
    for (const { id, reason } of errors) {
      failedRecords.set(id, { stageKey, data: { modelId: id }, reason: { message: reason } });
    }
    await context.fail({
      message: `Model ${first.id}: ${first.reason} (${errors.length} invalid model prices)`,
      failedRecords: [...failedRecords.values()]
    });
  };

  // 先处理旧失败明细，再继续游标；错误快照先于后续 checkpoint 更新。
  const retryIds = [...failedRecords.keys()];
  for (let offset = 0; offset < retryIds.length; offset += systemMigrationBatchSize) {
    context.signal.throwIfAborted();
    await context.assertActive();
    const ids = retryIds.slice(offset, offset + systemMigrationBatchSize);
    const records = await readFailedTokenPriceMigrationRecords(ids);
    const { errors } = await migrateTokenPricesBatch(records);
    ids.forEach((id) => failedRecords.delete(id));
    await assertNoErrors(errors, 'models');
    await context.reportFailedRecords([...failedRecords.values()]);
  }

  while (checkpoint.endId && checkpoint.lastId !== checkpoint.endId) {
    context.signal.throwIfAborted();
    await context.assertActive();
    const records = await readTokenPriceMigrationBatch({
      ...checkpoint,
      limit: systemMigrationBatchSize
    });
    if (records.length === 0) break;
    const { errors } = await migrateTokenPricesBatch(records);
    await assertNoErrors(errors, 'models');
    await context.assertActive();
    checkpoint = {
      ...checkpoint,
      lastId: String(records.at(-1)!._id),
      scannedCount: checkpoint.scannedCount + records.length
    };
    await context.saveCheckpoint(checkpoint);
    await context.reportProgress({
      key: 'models',
      status: SystemMigrationStatusEnum.running,
      current: checkpoint.scannedCount,
      total: checkpoint.total
    });
  }
  await context.reportProgress({
    key: 'models',
    status: SystemMigrationStatusEnum.succeeded,
    current: checkpoint.scannedCount,
    total: checkpoint.total
  });

  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
  await context.assertActive();
  const snapshot = await getTokenPriceMigrationSnapshot();
  let lastId: string | null = null;
  let verifiedCount = 0;
  while (snapshot.endId && lastId !== snapshot.endId) {
    context.signal.throwIfAborted();
    await context.assertActive();
    const records = await readTokenPriceMigrationBatch({
      lastId,
      endId: snapshot.endId,
      limit: systemMigrationBatchSize
    });
    if (records.length === 0) break;
    const errors = validateTokenPricesBatch(records);
    if (errors.length > 0) {
      // 校验发现已扫描区间内仍有旧数据时，重试需重新扫描，不能永久跳过坏记录。
      await context.saveCheckpoint({ version: 1, ...snapshot, lastId: null, scannedCount: 0 });
      await assertNoErrors(errors, 'validation');
    }
    lastId = String(records.at(-1)!._id);
    verifiedCount += records.length;
    await context.reportProgress({
      key: 'validation',
      status: SystemMigrationStatusEnum.running,
      current: verifiedCount,
      total: snapshot.total
    });
  }
  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.succeeded,
    current: verifiedCount,
    total: snapshot.total
  });
  return { verifiedCount };
};
