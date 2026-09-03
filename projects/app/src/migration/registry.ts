import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput,
  SystemMigrationProgressInput,
  SystemMigrationResultData
} from '@fastgpt/global/migration/schema';
import { SystemMigrationFailurePolicyEnum } from '@fastgpt/global/migration/constants';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { ZodType } from 'zod';
import { migrateLegacySystemModels } from './tasks/20260903_migrate_legacy_system_models';
import { backfillModelPermissionReferences } from './tasks/20260903_backfill_model_permissions';
import { backfillDatasetModelReferences } from './tasks/20260903_backfill_dataset_model_references';
import { backfillEvaluationModelReferences } from './tasks/20260903_backfill_evaluation_model_references';
import { backfillAppModelReferences } from './tasks/20260903_backfill_app_model_references';

export type SystemMigrationLogger = {
  info: (message: string, metadata?: Record<string, unknown>) => void;
  warn: (message: string, metadata?: Record<string, unknown>) => void;
  error: (message: string, metadata?: Record<string, unknown>) => void;
};

export type SystemMigrationProgressStep = {
  /** 任务内永久稳定的机器标识，用于按 key 更新 Mongo 阶段状态。 */
  key: string;
  /** client-only system_migration namespace 中的展示文案。 */
  labelKey: string;
};

/**
 * Runner 注入给脚本的唯一运行时能力。
 * 所有状态写入都由 runId fencing 保护；任务应在每个业务批次前检查 assertActive，
 * 但业务集合本身的重复写入安全仍由脚本的幂等设计负责。
 */
export type SystemMigrationContext = {
  /** 永久稳定的静态任务 ID。 */
  migrationId: string;
  /** 本次 lease 的 fencing token，接管后会变化。 */
  runId: string;
  /** lease 丢失或 runner 停止时触发，长任务应主动响应。 */
  signal: AbortSignal;
  /** 使用调用方提供的 Zod schema 校验持久化 checkpoint。 */
  getCheckpoint: <T>(schema: ZodType<T>) => Promise<T | undefined>;
  /** 非阻塞任务读取上次失败留下的坏数据；阻塞任务调用会被拒绝。 */
  getFailedRecords: () => Promise<SystemMigrationFailedRecord[]>;
  /** 非阻塞任务按批替换完整错误快照；必须在推进对应 checkpoint 前调用。 */
  reportFailedRecords: (failedRecords: SystemMigrationFailedRecord[]) => Promise<void>;
  /** 仅在一个幂等批次完整提交后保存恢复位置。 */
  saveCheckpoint: (checkpoint: Record<string, unknown>) => Promise<void>;
  /** 覆盖式保存面向管理员的最新进度，不记录历史。 */
  reportProgress: (progress: SystemMigrationProgressInput) => Promise<void>;
  /** 在下一批业务写入前确认本次 runId 仍拥有 lease。 */
  assertActive: () => Promise<void>;
  /** 保存可预期错误及最终错误快照，并终止当前执行。 */
  fail: (error: SystemMigrationFailureInput) => Promise<never>;
  logger: SystemMigrationLogger;
};

/** 静态注册项只描述不可变元数据；运行状态全部来自 Mongo。 */
export type SystemMigration = {
  /** 发布后不可修改或复用，推荐 YYYYMMDD_short_semantic_name。 */
  id: string;
  /** 首次引入版本，仅用于页面展示。 */
  version: string;
  nameKey: string;
  descriptionKey: string;
  /** 成功结果的展示模板；任务仅返回并持久化该模板需要的业务参数。 */
  resultKey: string;
  /** 按执行顺序声明全部阶段；展示文案不写入 Mongo。 */
  progressSteps: readonly SystemMigrationProgressStep[];
  /** 为 true 时，所有阻塞任务成功前当前节点不能进入业务 ready。 */
  blockStartup: boolean;
  /** 当前任务失败后，Runner 是暂停队列还是继续检查后续任务。 */
  onFailure: SystemMigrationFailurePolicyEnum;
  /** 正常返回可选最终结果；Runner 会在提交 succeeded 时原子持久化。 */
  run: (context: SystemMigrationContext) => Promise<SystemMigrationResultData | void>;
};

/**
 * 未来生产升级任务的唯一有序注册表。
 * 已发布任务只能从尾部追加，禁止修改 ID、顺序、blockStartup、onFailure 或既有函数语义。
 */
export const systemMigrations = [
  {
    id: '20260903_migrate_legacy_system_models',
    version: '4.17.0',
    nameKey: i18nT('system_migration:migrations.20260903_migrate_legacy_system_models.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20260903_migrate_legacy_system_models.description'
    ),
    resultKey: i18nT('system_migration:migrations.20260903_migrate_legacy_system_models.result'),
    progressSteps: [
      {
        key: 'loading_templates',
        labelKey: i18nT(
          'system_migration:migrations.20260903_migrate_legacy_system_models.loading_templates'
        )
      },
      {
        key: 'migrating',
        labelKey: i18nT(
          'system_migration:migrations.20260903_migrate_legacy_system_models.migrating'
        )
      },
      {
        key: 'reloading_models',
        labelKey: i18nT(
          'system_migration:migrations.20260903_migrate_legacy_system_models.reloading_models'
        )
      }
    ],
    blockStartup: true,
    onFailure: SystemMigrationFailurePolicyEnum.stop,
    run: migrateLegacySystemModels
  },
  {
    id: '20260903_backfill_model_permissions',
    version: '4.17.0',
    nameKey: i18nT('system_migration:migrations.20260903_backfill_model_permissions.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20260903_backfill_model_permissions.description'
    ),
    resultKey: i18nT('system_migration:migrations.20260903_backfill_model_permissions.result'),
    progressSteps: [
      {
        key: 'permissions',
        labelKey: i18nT(
          'system_migration:migrations.20260903_backfill_model_permissions.permissions'
        )
      }
    ],
    blockStartup: false,
    onFailure: SystemMigrationFailurePolicyEnum.continue,
    run: backfillModelPermissionReferences
  },
  {
    id: '20260903_backfill_dataset_model_references',
    version: '4.17.0',
    nameKey: i18nT('system_migration:migrations.20260903_backfill_dataset_model_references.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20260903_backfill_dataset_model_references.description'
    ),
    resultKey: i18nT(
      'system_migration:migrations.20260903_backfill_dataset_model_references.result'
    ),
    progressSteps: [
      {
        key: 'datasets',
        labelKey: i18nT(
          'system_migration:migrations.20260903_backfill_dataset_model_references.datasets'
        )
      }
    ],
    blockStartup: false,
    onFailure: SystemMigrationFailurePolicyEnum.continue,
    run: backfillDatasetModelReferences
  },
  {
    id: '20260903_backfill_evaluation_model_references',
    version: '4.17.0',
    nameKey: i18nT(
      'system_migration:migrations.20260903_backfill_evaluation_model_references.name'
    ),
    descriptionKey: i18nT(
      'system_migration:migrations.20260903_backfill_evaluation_model_references.description'
    ),
    resultKey: i18nT(
      'system_migration:migrations.20260903_backfill_evaluation_model_references.result'
    ),
    progressSteps: [
      {
        key: 'evaluations',
        labelKey: i18nT(
          'system_migration:migrations.20260903_backfill_evaluation_model_references.evaluations'
        )
      }
    ],
    blockStartup: false,
    onFailure: SystemMigrationFailurePolicyEnum.continue,
    run: backfillEvaluationModelReferences
  },
  {
    id: '20260903_backfill_app_model_references',
    version: '4.17.0',
    nameKey: i18nT('system_migration:migrations.20260903_backfill_app_model_references.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20260903_backfill_app_model_references.description'
    ),
    resultKey: i18nT('system_migration:migrations.20260903_backfill_app_model_references.result'),
    progressSteps: [
      {
        key: 'apps',
        labelKey: i18nT('system_migration:migrations.20260903_backfill_app_model_references.apps')
      },
      {
        key: 'app_versions',
        labelKey: i18nT(
          'system_migration:migrations.20260903_backfill_app_model_references.app_versions'
        )
      },
      {
        key: 'app_templates',
        labelKey: i18nT(
          'system_migration:migrations.20260903_backfill_app_model_references.app_templates'
        )
      }
    ],
    blockStartup: false,
    onFailure: SystemMigrationFailurePolicyEnum.continue,
    run: backfillAppModelReferences
  }
] as const satisfies readonly SystemMigration[];

/** 在 runner 启动前验证静态注册表，尽早暴露重复或不稳定的任务 ID。 */
export const validateSystemMigrationRegistry = (migrations: readonly SystemMigration[]): void => {
  const ids = new Set<string>();

  for (const migration of migrations) {
    if (!/^\d{8}_[a-z0-9_]+$/.test(migration.id)) {
      throw new Error(
        `Invalid system migration id "${migration.id}". Expected YYYYMMDD_short_semantic_name.`
      );
    }
    if (ids.has(migration.id)) {
      throw new Error(`Duplicate system migration id: ${migration.id}`);
    }
    ids.add(migration.id);

    if (
      migration.blockStartup &&
      migration.onFailure === SystemMigrationFailurePolicyEnum.continue
    ) {
      throw new Error(`Blocking system migration ${migration.id} must stop following migrations`);
    }

    const progressStepKeys = new Set<string>();
    for (const step of migration.progressSteps) {
      if (!step.key || progressStepKeys.has(step.key)) {
        throw new Error(`Invalid or duplicate progress step key "${step.key}" in ${migration.id}`);
      }
      progressStepKeys.add(step.key);
    }
  }
};
