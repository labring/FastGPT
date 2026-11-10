import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput,
  SystemMigrationProgressInput,
  SystemMigrationResultData
} from '@fastgpt/global/migration/schema';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { ZodType } from 'zod';
import { initializeDatasetVectorIndexes } from './tasks/4180/20261022_initialize_dataset_vector_indexes';
import { migrateInstanceConfigs } from './tasks/4180/20260928_migrate_instance_configs';
import { cleanupInstanceConfigDeprecatedFieldsTask } from './tasks/4180/20260929_cleanup_instance_config_deprecated_fields';
import { backfillChatPublishSource } from './tasks/4180/20261104_backfill_chat_publish_source';
import { backfillOpenApiKeyType } from './tasks/4180/20261104_backfill_openapi_key_type';
import { backfillExternalFileCheckTask } from './tasks/4180/20261110_backfill_external_file_check';

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
  /** 读取上次失败留下的坏数据，重试时优先处理。 */
  getFailedRecords: () => Promise<SystemMigrationFailedRecord[]>;
  /** 按批替换完整错误快照；必须在推进对应 checkpoint 前调用。 */
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
  /** 业务启动前必须成功；其完整依赖链一并提升到启动阶段。 */
  blockStartup?: boolean;
  /** 启动链完成后竞争集群共享的 3 个名额；与 blockStartup、manual、delay、非空依赖互斥。 */
  independent?: boolean;
  /**
   * 是否在获得租约后延迟执行。
   * 为 true 时，Runner 根据环境变量 SYSTEM_MIGRATION_DELAY_SECONDS 设定的时长延迟执行。
   */
  delay?: boolean;
  /** 管理员确认执行条件后才入队；等待期间跳过该任务继续后续自动任务。 */
  manual?: boolean;
  /**
   * succeeded 之后仍在每轮启动重新执行，用于「声明集合会增长」的任务：Runner 默认永久跳过
   * succeeded，注册表后来新增的成员（例如实例配置的 domain 列表）在老库里永远不会补建，
   * 而 Pro 启动要求成员齐全，表现为升级后商业版后台无法启动。
   * 前提：run 必须自带幂等跳过路径（成员齐全时只做只读校验、不写库），否则每轮都会重写；
   * 重新领取 succeeded 文档不会重置 checkpoint，resumable 任务不应依赖跨轮续跑游标。
   * 不能与 manual 组合：那会把「等管理员确认后才执行」变成每轮自动重跑。
   */
  resumable?: boolean;
  /** 必须先成功的前置任务 ID；只能引用注册表中更早的任务，避免乱序执行和循环依赖。 */
  dependsOn?: readonly string[];
  /** 正常返回可选最终结果；Runner 会在提交 succeeded 时原子持久化。 */
  run: (context: SystemMigrationContext) => Promise<SystemMigrationResultData | void>;
};

/**
 * 未来生产升级任务的唯一有序注册表。
 * 已发布任务只能从尾部追加，禁止修改 ID、顺序、调度模式、依赖或既有函数语义。
 */
export const systemMigrations = [
  {
    id: '20261022_initialize_dataset_vector_indexes',
    version: '4.18.0',
    nameKey: i18nT('system_migration:migrations.20261022_initialize_dataset_vector_indexes.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20261022_initialize_dataset_vector_indexes.description'
    ),
    resultKey: i18nT(
      'system_migration:migrations.20261022_initialize_dataset_vector_indexes.result'
    ),
    progressSteps: [
      {
        key: 'legacyIndex',
        labelKey: i18nT(
          'system_migration:migrations.20261022_initialize_dataset_vector_indexes.legacyIndex'
        )
      },
      {
        key: 'datasets',
        labelKey: i18nT(
          'system_migration:migrations.20261022_initialize_dataset_vector_indexes.datasets'
        )
      }
    ],
    blockStartup: false,
    run: initializeDatasetVectorIndexes
  },
  {
    id: '20261104_backfill_chat_publish_source',
    version: '4.18.0',
    // 仅追加历史来源且无迁移前置，独立调度避免等待普通后台长任务。
    independent: true,
    nameKey: i18nT('system_migration:migrations.20261104_backfill_chat_publish_source.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20261104_backfill_chat_publish_source.description'
    ),
    resultKey: i18nT('system_migration:migrations.20261104_backfill_chat_publish_source.result'),
    progressSteps: [
      {
        key: 'chats',
        labelKey: i18nT('system_migration:migrations.20261104_backfill_chat_publish_source.chats')
      },
      {
        key: 'chatLogs',
        labelKey: i18nT(
          'system_migration:migrations.20261104_backfill_chat_publish_source.chatLogs'
        )
      },
      {
        key: 'validation',
        labelKey: i18nT(
          'system_migration:migrations.20261104_backfill_chat_publish_source.validation'
        )
      }
    ],
    run: backfillChatPublishSource
  },
  {
    id: '20261104_backfill_openapi_key_type',
    version: '4.18.0',
    independent: true,
    nameKey: i18nT('system_migration:migrations.20261104_backfill_openapi_key_type.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20261104_backfill_openapi_key_type.description'
    ),
    resultKey: i18nT('system_migration:migrations.20261104_backfill_openapi_key_type.result'),
    progressSteps: [
      {
        key: 'keys',
        labelKey: i18nT('system_migration:migrations.20261104_backfill_openapi_key_type.keys')
      },
      {
        key: 'validation',
        labelKey: i18nT('system_migration:migrations.20261104_backfill_openapi_key_type.validation')
      }
    ],
    run: backfillOpenApiKeyType
  },
  {
    id: '20260928_migrate_instance_configs',
    version: '4.18.0',
    nameKey: i18nT('system_migration:migrations.20260928_migrate_instance_configs.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20260928_migrate_instance_configs.description'
    ),
    resultKey: i18nT('system_migration:migrations.20260928_migrate_instance_configs.result'),
    progressSteps: [
      {
        key: 'inspect',
        labelKey: i18nT('system_migration:migrations.20260928_migrate_instance_configs.inspect')
      },
      {
        key: 'migrate',
        labelKey: i18nT('system_migration:migrations.20260928_migrate_instance_configs.migrate')
      },
      {
        key: 'validate',
        labelKey: i18nT('system_migration:migrations.20260928_migrate_instance_configs.validate')
      }
    ],
    // 阻塞启动：迁移成功前节点不进入 ready，避免运行时读到 Schema 默认值而导致配置被静默重置。
    blockStartup: true,
    // 完成后数据库成为权威配置，不再重读历史 ENV。未来新增域应追加独立迁移补建。
    run: migrateInstanceConfigs
  },
  {
    id: '20260929_cleanup_instance_config_deprecated_fields',
    version: '4.18.0',
    nameKey: i18nT(
      'system_migration:migrations.20260929_cleanup_instance_config_deprecated_fields.name'
    ),
    descriptionKey: i18nT(
      'system_migration:migrations.20260929_cleanup_instance_config_deprecated_fields.description'
    ),
    resultKey: i18nT(
      'system_migration:migrations.20260929_cleanup_instance_config_deprecated_fields.result'
    ),
    progressSteps: [
      {
        key: 'cleanup',
        labelKey: i18nT(
          'system_migration:migrations.20260929_cleanup_instance_config_deprecated_fields.cleanup'
        )
      },
      {
        key: 'validation',
        labelKey: i18nT(
          'system_migration:migrations.20260929_cleanup_instance_config_deprecated_fields.validation'
        )
      }
    ],
    // 阻塞启动：残留字段会使 strictObject 校验失败，必须在节点 ready 前清理完成。
    blockStartup: true,
    // 可重入：字段后续从 Schema 移除时，已 succeeded 的老库仍需清理残留 overrides；
    // 任务本身声明为「确定性覆盖、重复执行无副作用」，无残留时不写库。
    resumable: true,
    run: cleanupInstanceConfigDeprecatedFieldsTask
  },
  {
    id: '20261110_backfill_external_file_check',
    version: '4.18.0',
    nameKey: i18nT('system_migration:migrations.20261110_backfill_external_file_check.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20261110_backfill_external_file_check.description'
    ),
    resultKey: i18nT('system_migration:migrations.20261110_backfill_external_file_check.result'),
    progressSteps: [
      {
        key: 'backfill',
        labelKey: i18nT(
          'system_migration:migrations.20261110_backfill_external_file_check.backfill'
        )
      },
      {
        key: 'validation',
        labelKey: i18nT(
          'system_migration:migrations.20261110_backfill_external_file_check.validation'
        )
      }
    ],
    dependsOn: [
      '20260928_migrate_instance_configs',
      '20260929_cleanup_instance_config_deprecated_fields'
    ],
    blockStartup: true,
    run: backfillExternalFileCheckTask
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
    for (const dependency of migration.dependsOn ?? []) {
      if (!ids.has(dependency)) {
        throw new Error(
          `System migration ${migration.id} must depend on an earlier registered task: ${dependency}`
        );
      }
    }
    ids.add(migration.id);

    if (migration.manual && migration.delay) {
      throw new Error(`Manual system migration ${migration.id} cannot be delayed`);
    }

    // manual 的语义是「等管理员入队才执行」，resumable 会把它变成每轮自动重跑
    if (migration.manual && migration.resumable) {
      throw new Error(`Manual system migration ${migration.id} cannot be resumable`);
    }

    if (migration.blockStartup && migration.independent) {
      throw new Error(`Blocking system migration ${migration.id} cannot run independently`);
    }

    if (
      migration.independent &&
      (migration.manual || migration.delay || migration.dependsOn?.length)
    ) {
      throw new Error(
        `Independent system migration ${migration.id} cannot be manual, delayed or have dependencies`
      );
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
