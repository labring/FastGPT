import type { SystemMigrationRunner } from './runner';

/**
 * 每个 App 节点等待共享启动链成功后，先重载本地模型，再启动业务与后台迁移。
 * 任一步失败均不能提前启动消费者或后台任务；启动链失败的恢复由 Runner 和日志负责。
 */
export const startBusinessAfterSystemMigrations = async ({
  runner,
  reloadModels,
  startBusinessServices
}: {
  runner: Pick<
    SystemMigrationRunner,
    'hasBlockingMigrations' | 'waitForBlockingMigrations' | 'startBackgroundMigrations'
  >;
  reloadModels: () => Promise<void>;
  startBusinessServices: () => Promise<void>;
}) => {
  await runner.waitForBlockingMigrations();
  if (runner.hasBlockingMigrations) await reloadModels();
  await startBusinessServices();
  runner.startBackgroundMigrations();
};
