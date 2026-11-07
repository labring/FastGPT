import type { SystemMigrationRunner } from './runner';

/**
 * 每个 App 节点等待共享启动链成功后，先重载本地模型，再启动业务与后台迁移。
 * 任一步失败均不能提前启动消费者或后台任务；启动链失败的恢复由 Runner 和日志负责。
 */
export const startBusinessAfterSystemMigrations = async ({
  runner,
  reloadModels,
  onMigrationsSettled,
  startBusinessServices
}: {
  runner: Pick<
    SystemMigrationRunner,
    'hasBlockingMigrations' | 'waitForBlockingMigrations' | 'startBackgroundMigrations'
  >;
  reloadModels: () => Promise<void>;
  onMigrationsSettled?: () => Promise<void>;
  startBusinessServices: () => Promise<void>;
}) => {
  await runner.waitForBlockingMigrations();
  if (runner.hasBlockingMigrations) {
    await reloadModels();
  } else {
    // 没有阻塞迁移时仍需在一次完整的启动迁移屏障后重新应用配置，
    // 主要是让首次日志 TTL 同步使用数据库中的权威保留期而不是 Schema 默认值。
    await onMigrationsSettled?.();
  }
  await startBusinessServices();
  runner.startBackgroundMigrations();
};
