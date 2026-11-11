import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '../../../registry';
import { rehomeSubserviceConnections, verifyRehomedSubserviceConnections } from './service';

/** 一次性启动迁移；既有配置优先，CAS 重试只补缺失连接，不覆盖后续管理员变更。 */
export const rehomeSubserviceConnectionsTask = async (context: SystemMigrationContext) => {
  await context.reportProgress({ key: 'migrate', status: SystemMigrationStatusEnum.running });
  const result = await rehomeSubserviceConnections({ assertActive: context.assertActive });
  await context.assertActive();
  await verifyRehomedSubserviceConnections();
  await context.reportProgress({ key: 'migrate', status: SystemMigrationStatusEnum.succeeded });
  return result;
};
