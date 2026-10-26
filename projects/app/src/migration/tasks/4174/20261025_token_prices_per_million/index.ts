import { z } from 'zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { systemMigrationBatchSize } from '@/migration/constants';
import {
  getTokenPriceMigrationSnapshot,
  readTokenPriceMigrationBatch,
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
 * 启动阻塞任务：按稳定游标分批转换全部 Token/TTS 旧价格，STT 保持原样。
 * 只在整批成功后推进断点，坏数据立即停止并输出有限定位日志，修复后重启续跑。
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

  /** 阻塞期间管理页不可用，只记录首条定位信息并终止，不读写失败明细。 */
  const assertNoErrors = (errors: TokenPriceMigrationError[]) => {
    const first = errors[0];
    if (!first) return;
    context.logger.error('Model pricing migration requires source repair', {
      errorCount: errors.length,
      modelId: first.id,
      reason: first.reason
    });
    throw new Error(`Model ${first.id}: ${first.reason} (${errors.length} invalid model prices)`);
  };

  while (checkpoint.endId && checkpoint.lastId !== checkpoint.endId) {
    context.signal.throwIfAborted();
    await context.assertActive();
    const records = await readTokenPriceMigrationBatch({
      ...checkpoint,
      limit: systemMigrationBatchSize
    });
    if (records.length === 0) break;
    const { errors } = await migrateTokenPricesBatch(records);
    assertNoErrors(errors);
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
      // 校验发现已扫描区间内仍有旧数据时，重启需重新扫描，不能永久跳过坏记录。
      await context.saveCheckpoint({ version: 1, ...snapshot, lastId: null, scannedCount: 0 });
      assertNoErrors(errors);
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
