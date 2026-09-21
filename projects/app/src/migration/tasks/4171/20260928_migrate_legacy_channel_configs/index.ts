import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { migrateLegacyChannelConfigsService } from './service';

const STAGE_KEY = 'channels';

/**
 * 将旧模型配置（requestUrl, requestAuth）平滑迁移为 AI Proxy 系统渠道。
 * 非阻塞，支持延迟与幂等重跑。
 */
export const migrateLegacyChannelConfigs = async (context: SystemMigrationContext) => {
  await context.reportProgress({ key: STAGE_KEY, status: SystemMigrationStatusEnum.running });
  await context.assertActive();

  context.logger.info('Starting legacy channel configs migration');

  const result = await migrateLegacyChannelConfigsService({
    assertActive: context.assertActive
  });

  await context.assertActive();
  await context.reportProgress({
    key: STAGE_KEY,
    status: SystemMigrationStatusEnum.succeeded,
    current: result.migratedCount,
    total: result.scannedCount
  });

  context.logger.info('Legacy channel configs migration completed', {
    scannedCount: result.scannedCount,
    migratedCount: result.migratedCount,
    skippedCount: result.skippedCount
  });

  return result;
};
