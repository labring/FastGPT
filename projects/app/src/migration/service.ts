import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  SystemMigrationFailedRecordsResponseSchema,
  SystemMigrationListResponseSchema,
  type SystemMigrationFailedRecordsResponse,
  type SystemMigrationListResponse
} from '@fastgpt/global/migration/schema';
import {
  ensureMigrationStates,
  getMigrationFailedRecordCounts,
  getMigrationFailedRecords,
  getMigrationServerTime,
  getMigrationStates,
  resetFailedMigration
} from './entity';
import { systemMigrations, type SystemMigration } from './registry';
import type { SystemMigrationStateSchemaType } from './mongoSchema';

const getStateMap = (states: SystemMigrationStateSchemaType[]) =>
  new Map(states.map((state) => [state._id, state]));

/** 静态阶段保证未执行项也可见，Mongo 只补充已经上报过的可变状态。 */
const getProgressList = (
  migration: SystemMigration,
  state: SystemMigrationStateSchemaType | undefined,
  failedRecordCounts: Map<string, number>
) => {
  const storedProgress = state?.progress ?? [];
  const progressMap = new Map(storedProgress.map((progress) => [progress.key, progress]));

  return migration.progressSteps.map(({ key, labelKey }) => ({
    key,
    labelKey,
    status: SystemMigrationStatusEnum.pending,
    ...progressMap.get(key),
    failedRecordCount: failedRecordCounts.get(key) ?? 0
  }));
};

/** 合并不可变静态元数据和 Mongo 最新运行状态，供管理员页面读取。 */
export const getSystemMigrationList = async (
  migrations: readonly SystemMigration[] = systemMigrations
): Promise<SystemMigrationListResponse> => {
  const migrationIds = migrations.map((migration) => migration.id);
  let states = await getMigrationStates(migrationIds);
  const existingIds = new Set(states.map((state) => state._id));
  const missingIds = migrationIds.filter((migrationId) => !existingIds.has(migrationId));
  if (missingIds.length > 0) {
    // 页面可能先于某个 runner 请求列表；此处只补 pending 文档，不会触发任务执行。
    await ensureMigrationStates(missingIds);
    states = await getMigrationStates(migrationIds);
  }
  const stateMap = getStateMap(states);
  const failedRecordCounts = await getMigrationFailedRecordCounts(migrationIds);
  const failedRecordCountMap = new Map<string, Map<string, number>>();
  for (const { migrationId, stageKey, count } of failedRecordCounts) {
    const stageCountMap = failedRecordCountMap.get(migrationId) ?? new Map<string, number>();
    stageCountMap.set(stageKey, count);
    failedRecordCountMap.set(migrationId, stageCountMap);
  }

  return SystemMigrationListResponseSchema.parse({
    serverTime: await getMigrationServerTime(),
    // register() 会同步等待阻塞任务；这里展示的是数据库事实，不再维护第二套进程内状态。
    businessReady: migrations
      .filter((migration) => migration.blockStartup)
      .every(
        (migration) => stateMap.get(migration.id)?.status === SystemMigrationStatusEnum.succeeded
      ),
    migrations: migrations.map((migration, index) => {
      const state = stateMap.get(migration.id);
      const stageFailedRecordCounts =
        failedRecordCountMap.get(migration.id) ?? new Map<string, number>();
      return {
        id: migration.id,
        version: migration.version,
        order: index + 1,
        nameKey: migration.nameKey,
        descriptionKey: migration.descriptionKey,
        blockStartup: migration.blockStartup,
        onFailure: migration.onFailure,
        status: state?.status ?? SystemMigrationStatusEnum.pending,
        heartbeatAt: state?.heartbeatAt,
        leaseExpireAt: state?.leaseExpireAt,
        progress: getProgressList(migration, state, stageFailedRecordCounts),
        // 最终结果只属于 succeeded 终态，异常历史数据不能被客户端误认为本轮成功结果。
        result:
          state?.status === SystemMigrationStatusEnum.succeeded && state.result !== undefined
            ? {
                // i18n key 来自当前代码注册表，Mongo 只提供模板所需的业务参数。
                key: migration.resultKey,
                params: state.result
              }
            : undefined,
        lastError: state?.lastError,
        // 错误明细没有总量上限，列表轮询只返回数量，避免持续传输大对象。
        failedRecordCount: Array.from(stageFailedRecordCounts.values()).reduce(
          (total, count) => total + count,
          0
        ),
        startedAt: state?.startedAt,
        lastStartedAt: state?.lastStartedAt,
        completedAt: state?.completedAt,
        updatedAt: state?.updatedAt
      };
    })
  });
};

/** 按需返回单个任务最近一次失败的数据，避免大数组进入高频列表轮询。 */
export const getSystemMigrationFailedRecords = async (
  migrationId: string,
  stageKey: string,
  migrations: readonly SystemMigration[] = systemMigrations
): Promise<SystemMigrationFailedRecordsResponse> => {
  const migration = migrations.find((migration) => migration.id === migrationId);
  if (!migration) {
    throw new UserError('System migration not found');
  }
  if (!migration.progressSteps.some((stage) => stage.key === stageKey)) {
    throw new UserError('System migration stage not found');
  }

  return SystemMigrationFailedRecordsResponseSchema.parse({
    migrationId,
    stageKey,
    failedRecords: await getMigrationFailedRecords(migrationId, stageKey)
  });
};

/** 仅允许管理员把非阻塞 failed 任务恢复为 pending，并保留断点和错误数据等待 runner 接管。 */
export const retryNonBlockingSystemMigration = async (
  migrationId: string,
  migrations: readonly SystemMigration[] = systemMigrations
): Promise<void> => {
  const migration = migrations.find((item) => item.id === migrationId);
  if (!migration) throw new UserError('System migration not found');
  if (migration.blockStartup) {
    throw new UserError('Blocking system migration must be recovered by restarting the App node');
  }
  if (!(await resetFailedMigration(migrationId))) {
    // 条件更新把重复点击、执行中和已成功任务统一挡在状态边界外。
    throw new UserError('Only a failed system migration can be retried');
  }
};

/** 读取阻塞任务状态；缺失、pending、running 和 failed 都必须继续阻塞启动。 */
export const areBlockingMigrationsComplete = async (
  migrations: readonly SystemMigration[] = systemMigrations
): Promise<boolean> => {
  const blockingIds = migrations
    .filter((migration) => migration.blockStartup)
    .map((migration) => migration.id);

  if (blockingIds.length === 0) return true;

  const states = await getMigrationStates(blockingIds);
  const stateMap = getStateMap(states);
  return blockingIds.every(
    (migrationId) => stateMap.get(migrationId)?.status === SystemMigrationStatusEnum.succeeded
  );
};
