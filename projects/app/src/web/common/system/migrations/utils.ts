import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type {
  SystemMigrationListItem,
  SystemMigrationProgressListItem
} from '@fastgpt/global/migration/schema';

export type SystemMigrationDisplayStatus = SystemMigrationStatusEnum | 'reclaiming';

/** 将过期 running 映射为等待接管态，避免页面仍把失联节点展示为正常执行中。 */
export const getSystemMigrationDisplayStatus = ({
  migration,
  serverTime
}: {
  migration: SystemMigrationListItem;
  serverTime: Date | string;
}): SystemMigrationDisplayStatus => {
  if (
    migration.status === SystemMigrationStatusEnum.running &&
    (!migration.leaseExpireAt ||
      new Date(migration.leaseExpireAt).getTime() <= new Date(serverTime).getTime())
  ) {
    return 'reclaiming';
  }
  return migration.status;
};

/** 未提供完整计数时隐藏进度；显式空任务显示 0%，成功后显示 100%。 */
export const getSystemMigrationProgressPercent = (progress: SystemMigrationProgressListItem) => {
  const current = progress.current;
  const total = progress.total;
  if (current === undefined || total === undefined) return undefined;
  if (total === 0) return progress.status === SystemMigrationStatusEnum.succeeded ? 100 : 0;
  return Math.min(100, Math.round((current / total) * 100));
};
