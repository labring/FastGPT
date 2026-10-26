import { validateSystemMigrationRegistry, type SystemMigration } from './registry';

/**
 * 校验注册表并提取启动所需的完整依赖闭包，其余任务留到业务启动后执行。
 * 注册表已要求依赖位于前方，因此筛选后的原顺序就是稳定的拓扑顺序；
 * 独立前置在启动阶段串行执行，手动或延迟前置则无法保证自动启动，必须拒绝。
 */
export const createSystemMigrationPlan = (migrations: readonly SystemMigration[]) => {
  validateSystemMigrationRegistry(migrations);
  const migrationsById = new Map(migrations.map((migration) => [migration.id, migration]));
  const startupIds = new Set<string>();

  /** 依赖存在且只指向更早任务已由注册表校验保证，不会出现环。 */
  const includeStartupMigration = (migration: SystemMigration) => {
    if (startupIds.has(migration.id)) return;
    if (migration.manual || migration.delay) {
      throw new Error(
        `Startup migration chain cannot include manual or delayed task: ${migration.id}`
      );
    }
    startupIds.add(migration.id);
    for (const dependencyId of migration.dependsOn ?? []) {
      includeStartupMigration(migrationsById.get(dependencyId)!);
    }
  };

  migrations.filter((migration) => migration.blockStartup).forEach(includeStartupMigration);
  return {
    startupMigrations: migrations.filter((migration) => startupIds.has(migration.id)),
    backgroundMigrations: migrations.filter((migration) => !startupIds.has(migration.id))
  };
};
