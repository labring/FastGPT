import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '../../../registry';
import { backfillModelDeprecationSms, verifyModelDeprecationSms } from './service';

/** 启动前幂等回填旧模型下架短信模板，并验证已保留管理员意图。 */
export const backfillModelDeprecationSmsTask = async (context: SystemMigrationContext) => {
  await context.reportProgress({ key: 'backfill', status: SystemMigrationStatusEnum.running });
  const result = await backfillModelDeprecationSms({ assertActive: context.assertActive });
  await context.reportProgress({ key: 'backfill', status: SystemMigrationStatusEnum.succeeded });
  await context.assertActive();
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
  await verifyModelDeprecationSms();
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.succeeded });
  return result;
};
