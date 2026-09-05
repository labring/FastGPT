import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { backfillLegacyBalanceBillMetadata, countLegacyBalanceBillsWithoutPayWay } from './service';

const STAGE_KEY = 'bills';

/**
 * 幂等全量回填历史微信充值账单的支付元数据。目标值由旧版唯一的微信支付链路确定，
 * 任务规模有界且 updateMany 使用 compare-and-set 条件，中断后可安全全量重放。
 */
export const backfillBillMetadata = async (context: SystemMigrationContext) => {
  const total = await countLegacyBalanceBillsWithoutPayWay();
  await context.reportProgress({
    key: STAGE_KEY,
    status: SystemMigrationStatusEnum.running,
    current: 0,
    total
  });

  await context.assertActive();
  const { modifiedCount } = await backfillLegacyBalanceBillMetadata();

  await context.assertActive();
  const remainingCount = await countLegacyBalanceBillsWithoutPayWay();
  if (remainingCount > 0) {
    context.logger.error('Historical balance bills still lack payment metadata', {
      remainingCount
    });
    throw new Error(`${remainingCount} historical balance bills still lack payment metadata`);
  }

  await context.reportProgress({
    key: STAGE_KEY,
    status: SystemMigrationStatusEnum.succeeded,
    current: total,
    total
  });

  return { migratedCount: modifiedCount };
};
