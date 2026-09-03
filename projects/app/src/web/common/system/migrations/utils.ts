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

/** 只有同时提供 current/total 且 total 大于零时才渲染确定性进度条。 */
export const getSystemMigrationProgressPercent = (progress: SystemMigrationProgressListItem) => {
  const current = progress.current;
  const total = progress.total;
  if (current === undefined || total === undefined || total <= 0) return undefined;
  return Math.min(100, Math.round((current / total) * 100));
};
