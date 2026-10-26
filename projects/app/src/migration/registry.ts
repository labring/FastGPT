import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput,
  SystemMigrationProgressInput,
  SystemMigrationResultData
} from '@fastgpt/global/migration/schema';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { ZodType } from 'zod';
import { migrateLegacySystemModels } from './tasks/4170/20260903_migrate_legacy_system_models';
import { backfillModelPermissionReferences } from './tasks/4170/20260903_backfill_model_permissions';
import { backfillDatasetModelReferences } from './tasks/4170/20260903_backfill_dataset_model_references';
import { backfillEvaluationModelReferences } from './tasks/4170/20260903_backfill_evaluation_model_references';
import { backfillAppModelReferences } from './tasks/4170/20260903_backfill_app_model_references';
import { backfillResourceCreateTime } from './tasks/4170/20260903_backfill_resource_create_time';
import { backfillBillMetadata } from './tasks/4170/20260905_backfill_bill_metadata';
import { backfillResourceOwnerAcl } from './tasks/4170/20260905_backfill_resource_owner_acl';
import { cleanupTeamMemberRoles } from './tasks/4170/20260907_cleanup_team_member_roles';
import { cleanupLegacyInvitedMembers } from './tasks/4170/20260908_cleanup_legacy_invited_members';
import { migrateDatasetTagsV2 } from './tasks/4171/20260907_migrate_dataset_tags_v2';
import { backfillAppResourceSnapshots } from './tasks/4171/20260916_backfill_app_resource_snapshots';
import { enableChannelReasoningMapping } from './tasks/4171/20260923_enable_channel_reasoning_mapping';
import { backfillMemberNameSet } from './tasks/4171/20260928_backfill_member_name_set';
import { migrateDatasetRebuildStatus } from './tasks/4171/20261009_migrate_dataset_rebuild_status';
import { backfillFolderAncestorIds } from './tasks/4173/20261022_backfill_folder_ancestor_ids';
import { migrateChunkTraining } from './tasks/4171/20261008_migrate_chunk_training';
import { backfillAgentSandboxTeamId } from './tasks/4173/20261009_backfill_agent_sandbox_team_id';

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
    id: '20260907_cleanup_team_member_roles',
    independent: true,
    version: '4.17.0',
    nameKey: i18nT('system_migration:migrations.20260907_cleanup_team_member_roles.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20260907_cleanup_team_member_roles.description'
    ),
    resultKey: i18nT('system_migration:migrations.20260907_cleanup_team_member_roles.result'),
    progressSteps: [
      {
        key: 'members',
        labelKey: i18nT('system_migration:migrations.20260907_cleanup_team_member_roles.members')
      },
      {
        key: 'validation',
        labelKey: i18nT('system_migration:migrations.20260907_cleanup_team_member_roles.validation')
      }
    ],
    run: cleanupTeamMemberRoles
  },
  {
    id: '20260903_migrate_legacy_system_models',
    blockStartup: true,
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
    run: migrateLegacySystemModels
  },
  {
    id: '20260903_backfill_model_permissions',
    // 权限回填必须等模型目录迁移成功，避免将有效的旧名称权限误判为悬空权限。
    dependsOn: ['20260903_migrate_legacy_system_models'],
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
    run: backfillModelPermissionReferences
  },
  {
    id: '20260903_backfill_dataset_model_references',
    // 引用回填必须使用迁移完成后的模型目录，避免根据不完整目录写入错误 ID。
    dependsOn: ['20260903_migrate_legacy_system_models'],
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
    run: backfillDatasetModelReferences
  },
  {
    id: '20260903_backfill_evaluation_model_references',
    // 引用回填必须使用迁移完成后的模型目录，避免根据不完整目录写入错误 ID。
    dependsOn: ['20260903_migrate_legacy_system_models'],
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
    run: backfillEvaluationModelReferences
  },
  {
    id: '20260903_backfill_app_model_references',
    // 引用回填必须使用迁移完成后的模型目录，避免根据不完整目录写入错误 ID。
    dependsOn: ['20260903_migrate_legacy_system_models'],
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
    run: backfillAppModelReferences
  },
  {
    id: '20260903_backfill_resource_create_time',
    independent: true,
    version: '4.17.0',
    nameKey: i18nT('system_migration:migrations.20260903_backfill_resource_create_time.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20260903_backfill_resource_create_time.description'
    ),
    resultKey: i18nT('system_migration:migrations.20260903_backfill_resource_create_time.result'),
    progressSteps: [
      {
        key: 'apps',
        labelKey: i18nT('system_migration:migrations.20260903_backfill_resource_create_time.apps')
      },
      {
        key: 'datasets',
        labelKey: i18nT(
          'system_migration:migrations.20260903_backfill_resource_create_time.datasets'
        )
      }
    ],
    run: backfillResourceCreateTime
  },
  {
    id: '20260905_backfill_bill_metadata',
    independent: true,
    version: '4.17.0',
    nameKey: i18nT('system_migration:migrations.20260905_backfill_bill_metadata.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20260905_backfill_bill_metadata.description'
    ),
    resultKey: i18nT('system_migration:migrations.20260905_backfill_bill_metadata.result'),
    progressSteps: [
      {
        key: 'bills',
        labelKey: i18nT('system_migration:migrations.20260905_backfill_bill_metadata.bills')
      }
    ],
    run: backfillBillMetadata
  },
  {
    id: '20260905_backfill_resource_owner_acl',
    version: '4.17.0',
    nameKey: i18nT('system_migration:migrations.20260905_backfill_resource_owner_acl.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20260905_backfill_resource_owner_acl.description'
    ),
    resultKey: i18nT('system_migration:migrations.20260905_backfill_resource_owner_acl.result'),
    progressSteps: [
      {
        key: 'apps',
        labelKey: i18nT('system_migration:migrations.20260905_backfill_resource_owner_acl.apps')
      },
      {
        key: 'datasets',
        labelKey: i18nT('system_migration:migrations.20260905_backfill_resource_owner_acl.datasets')
      },
      {
        key: 'agent_skills',
        labelKey: i18nT(
          'system_migration:migrations.20260905_backfill_resource_owner_acl.agent_skills'
        )
      },
      {
        key: 'validation',
        labelKey: i18nT(
          'system_migration:migrations.20260905_backfill_resource_owner_acl.validation'
        )
      }
    ],
    run: backfillResourceOwnerAcl
  },
  {
    id: '20260908_cleanup_legacy_invited_members',
    version: '4.17.0',
    nameKey: i18nT('system_migration:migrations.20260908_cleanup_legacy_invited_members.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20260908_cleanup_legacy_invited_members.description'
    ),
    resultKey: i18nT('system_migration:migrations.20260908_cleanup_legacy_invited_members.result'),
    progressSteps: [
      {
        key: 'cleanup',
        labelKey: i18nT(
          'system_migration:migrations.20260908_cleanup_legacy_invited_members.cleanup'
        )
      },
      {
        key: 'validation',
        labelKey: i18nT(
          'system_migration:migrations.20260908_cleanup_legacy_invited_members.validation'
        )
      }
    ],
    run: cleanupLegacyInvitedMembers
  },
  {
    id: '20260907_migrate_dataset_tags_v2',
    independent: true,
    version: '4.17.1',
    nameKey: i18nT('system_migration:migrations.20260907_migrate_dataset_tags_v2.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20260907_migrate_dataset_tags_v2.description'
    ),
    resultKey: i18nT('system_migration:migrations.20260907_migrate_dataset_tags_v2.result'),
    progressSteps: [
      {
        key: 'datasets',
        labelKey: i18nT('system_migration:migrations.20260907_migrate_dataset_tags_v2.datasets')
      },
      {
        key: 'collections',
        labelKey: i18nT('system_migration:migrations.20260907_migrate_dataset_tags_v2.collections')
      },
      {
        key: 'validation',
        labelKey: i18nT('system_migration:migrations.20260907_migrate_dataset_tags_v2.validation')
      }
    ],
    run: migrateDatasetTagsV2
  },
  {
    id: '20260916_backfill_app_resource_snapshots',
    // 资源提取只读取模型 ID，必须等 App、Version 和模板的模型引用回填全部成功。
    dependsOn: ['20260903_backfill_app_model_references'],
    version: '4.17.1',
    nameKey: i18nT('system_migration:migrations.20260916_backfill_app_resource_snapshots.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20260916_backfill_app_resource_snapshots.description'
    ),
    resultKey: i18nT('system_migration:migrations.20260916_backfill_app_resource_snapshots.result'),
    progressSteps: [
      {
        key: 'clean_v1_apps',
        labelKey: i18nT(
          'system_migration:migrations.20260916_backfill_app_resource_snapshots.clean_v1_apps'
        )
      },
      {
        key: 'versions',
        labelKey: i18nT(
          'system_migration:migrations.20260916_backfill_app_resource_snapshots.versions'
        )
      },
      {
        key: 'apps',
        labelKey: i18nT('system_migration:migrations.20260916_backfill_app_resource_snapshots.apps')
      },
      {
        key: 'validation',
        labelKey: i18nT(
          'system_migration:migrations.20260916_backfill_app_resource_snapshots.validation'
        )
      }
    ],
    delay: true,
    run: backfillAppResourceSnapshots
  },
  {
    id: '20260923_enable_channel_reasoning_mapping',
    version: '4.17.1',
    nameKey: i18nT('system_migration:migrations.20260923_enable_channel_reasoning_mapping.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20260923_enable_channel_reasoning_mapping.description'
    ),
    resultKey: i18nT(
      'system_migration:migrations.20260923_enable_channel_reasoning_mapping.result'
    ),
    progressSteps: [
      {
        key: 'channels',
        labelKey: i18nT(
          'system_migration:migrations.20260923_enable_channel_reasoning_mapping.channels'
        )
      }
    ],
    delay: true,
    run: enableChannelReasoningMapping
  },
  {
    id: '20260928_backfill_member_name_set',
    independent: true,
    version: '4.17.1',
    nameKey: i18nT('system_migration:migrations.20260928_backfill_member_name_set.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20260928_backfill_member_name_set.description'
    ),
    resultKey: i18nT('system_migration:migrations.20260928_backfill_member_name_set.result'),
    progressSteps: [
      {
        key: 'members',
        labelKey: i18nT('system_migration:migrations.20260928_backfill_member_name_set.members')
      },
      {
        key: 'validation',
        labelKey: i18nT('system_migration:migrations.20260928_backfill_member_name_set.validation')
      }
    ],
    run: backfillMemberNameSet
  },
  {
    id: '20261008_migrate_chunk_training',
    version: '4.17.1',
    nameKey: i18nT('system_migration:migrations.20261008_migrate_chunk_training.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20261008_migrate_chunk_training.description'
    ),
    resultKey: i18nT('system_migration:migrations.20261008_migrate_chunk_training.result'),
    progressSteps: [
      {
        key: 'trainings',
        labelKey: i18nT('system_migration:migrations.20261008_migrate_chunk_training.trainings')
      },
      {
        key: 'validation',
        labelKey: i18nT('system_migration:migrations.20261008_migrate_chunk_training.validation')
      }
    ],
    manual: true,
    run: migrateChunkTraining
  },
  {
    id: '20261009_migrate_dataset_rebuild_status',
    dependsOn: ['20261008_migrate_chunk_training'],
    version: '4.17.1',
    nameKey: i18nT('system_migration:migrations.20261009_migrate_dataset_rebuild_status.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20261009_migrate_dataset_rebuild_status.description'
    ),
    resultKey: i18nT('system_migration:migrations.20261009_migrate_dataset_rebuild_status.result'),
    progressSteps: [
      {
        key: 'datas',
        labelKey: i18nT('system_migration:migrations.20261009_migrate_dataset_rebuild_status.datas')
      },
      {
        key: 'trainings',
        labelKey: i18nT(
          'system_migration:migrations.20261009_migrate_dataset_rebuild_status.trainings'
        )
      },
      {
        key: 'validation',
        labelKey: i18nT(
          'system_migration:migrations.20261009_migrate_dataset_rebuild_status.validation'
        )
      }
    ],
    manual: true,
    run: migrateDatasetRebuildStatus
  },
  {
    id: '20261009_backfill_agent_sandbox_team_id',
    independent: true,
    version: '4.17.3',
    nameKey: i18nT('system_migration:migrations.20261009_backfill_agent_sandbox_team_id.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20261009_backfill_agent_sandbox_team_id.description'
    ),
    resultKey: i18nT('system_migration:migrations.20261009_backfill_agent_sandbox_team_id.result'),
    progressSteps: [
      {
        key: 'instances',
        labelKey: i18nT(
          'system_migration:migrations.20261009_backfill_agent_sandbox_team_id.instances'
        )
      },
      {
        key: 'validation',
        labelKey: i18nT(
          'system_migration:migrations.20261009_backfill_agent_sandbox_team_id.validation'
        )
      }
    ],
    // 缺 teamId 只影响团队配额归属：app 会话与技能编辑共用系统总上限，且运行期会惰性补齐，
    // 孤儿记录只跳过，来源异常或校验发现的遗漏由管理员修复后重试。
    run: backfillAgentSandboxTeamId
  },
  {
    id: '20261022_backfill_folder_ancestor_ids',
    independent: true,
    version: '4.17.3',
    nameKey: i18nT('system_migration:migrations.20261022_backfill_folder_ancestor_ids.name'),
    descriptionKey: i18nT(
      'system_migration:migrations.20261022_backfill_folder_ancestor_ids.description'
    ),
    resultKey: i18nT('system_migration:migrations.20261022_backfill_folder_ancestor_ids.result'),
    progressSteps: [
      {
        key: 'apps',
        labelKey: i18nT('system_migration:migrations.20261022_backfill_folder_ancestor_ids.apps')
      },
      {
        key: 'datasets',
        labelKey: i18nT(
          'system_migration:migrations.20261022_backfill_folder_ancestor_ids.datasets'
        )
      },
      {
        key: 'validation',
        labelKey: i18nT(
          'system_migration:migrations.20261022_backfill_folder_ancestor_ids.validation'
        )
      }
    ],
    run: backfillFolderAncestorIds
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
