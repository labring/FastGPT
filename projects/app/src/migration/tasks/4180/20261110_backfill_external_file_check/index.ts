import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '../../../registry';
import { backfillExternalFileCheck, verifyExternalFileCheck } from './service';

/**
 * 启动前回填外部文件检查开关，避免旧非空名单因新字段默认关闭而失效。
 * 只涉及一条 security 文档，采用幂等全量重跑，无需 checkpoint；不修改原名单。
 */
export const backfillExternalFileCheckTask = async (context: SystemMigrationContext) => {
  await context.reportProgress({ key: 'backfill', status: SystemMigrationStatusEnum.running });
  const result = await backfillExternalFileCheck({ assertActive: context.assertActive });
  await context.reportProgress({ key: 'backfill', status: SystemMigrationStatusEnum.succeeded });

  await context.assertActive();
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
  await verifyExternalFileCheck();
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.succeeded });
  return result;
};
