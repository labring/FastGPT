/** Sandbox 内部状态、运行策略与限制常量；时间策略默认使用毫秒，其他单位在名称中明确。 */
// 生命周期状态与操作
export const sandboxInstanceStatusList = [
  'provisioning',
  'legacyMigrating',
  'running',
  'stopping',
  'stopped',
  'archiving',
  'archived',
  'restoring',
  'deleting'
] as const;

export const SandboxInstanceStatusEnum = {
  provisioning: 'provisioning',
  legacyMigrating: 'legacyMigrating',
  running: 'running',
  stopping: 'stopping',
  stopped: 'stopped',
  archiving: 'archiving',
  archived: 'archived',
  restoring: 'restoring',
  deleting: 'deleting'
} as const satisfies Record<(typeof sandboxInstanceStatusList)[number], string>;

export const sandboxStableStatusList = ['running', 'stopped', 'archived'] as const;

/**
 * 计入沙箱 Quota 的实例状态：占用 provider 资源，或正在创建/恢复远端资源。
 * 系统总上限与团队配额共用同一个计数池（忽略 provider 与 sourceType）。
 * 不计入 stopped/archived（无远端计算资源）与 deleting（释放路径中的终态，不得被 Quota 阻塞）。
 */
export const sandboxActiveStatusList = [
  'provisioning',
  'legacyMigrating',
  'running',
  'stopping',
  'archiving',
  'restoring'
] as const satisfies readonly (typeof sandboxInstanceStatusList)[number][];

export const sandboxOperationTypeList = [
  'provision',
  'legacyMigration',
  'stop',
  'archive',
  'restore',
  'delete'
] as const;

export const SandboxOperationTypeEnum = {
  provision: 'provision',
  legacyMigration: 'legacyMigration',
  stop: 'stop',
  archive: 'archive',
  restore: 'restore',
  delete: 'delete'
} as const satisfies Record<(typeof sandboxOperationTypeList)[number], string>;

export const expectedOperationByStatus = {
  running: undefined,
  stopped: undefined,
  archived: undefined,
  provisioning: 'provision',
  legacyMigrating: 'legacyMigration',
  stopping: 'stop',
  archiving: 'archive',
  restoring: 'restore',
  deleting: 'delete'
} as const satisfies Record<
  (typeof sandboxInstanceStatusList)[number],
  (typeof sandboxOperationTypeList)[number] | undefined
>;

/** 远端结果未知时的接管隔离时间：provision/stop 为 5 分钟，其余为 20 分钟。 */
export const SANDBOX_OPERATION_ISOLATION_MS = {
  provision: 300_000,
  legacyMigration: 1_200_000,
  stop: 300_000,
  archive: 1_200_000,
  restore: 1_200_000,
  delete: 1_200_000
} as const satisfies Record<(typeof sandboxOperationTypeList)[number], number>;

/** 含旧版 rollbackProviderDeleted；这些阶段只能沿持久化的清理方向续跑。 */
export const SANDBOX_ACTIVATION_ROLLBACK_PHASES = [
  'rollbackClaimed',
  'rollbackProviderReleased',
  'rollbackVolumeReleased',
  'rollbackProviderDeleted'
] as const;

// 归档与资源清理批量策略
export const SANDBOX_ARCHIVE_BATCH_SIZE = 5;
export const SANDBOX_ARCHIVE_CURSOR_BATCH_SIZE = 100;
export const SOURCE_DELETE_CONCURRENCY = 10;

// 归档命令最长 10 分钟，目录创建最长 1 分钟。
export const SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS = 600_000;
export const SANDBOX_ARCHIVE_DIRECTORY_TIMEOUT_MS = 60_000;

// 配置准备最多等待 45 分钟，每秒重试；等待上限独立于远端操作隔离策略。
export const SANDBOX_RUNTIME_CONFIGURATION_TIMEOUT_MS = 2_700_000;
export const SANDBOX_RUNTIME_CONFIGURATION_RETRY_INTERVAL_MS = 1_000;

// 预览会话限制；TTL 使用 Redis EX 接口要求的秒
export const SANDBOX_PREVIEW_SESSION_TTL_SECONDS = 7_200;
export const SANDBOX_PREVIEW_SESSION_MAX_PER_SANDBOX = 500;
export const SANDBOX_PREVIEW_SESSION_ID_LENGTH = 24;

// 工具默认查询和输出限制
export const SANDBOX_TOOL_MAX_LINES = 2000;
export const SANDBOX_TOOL_MAX_BYTES = 50 * 1024;
export const DEFAULT_LS_LIMIT = 500;
export const DEFAULT_FIND_LIMIT = 1000;
export const DEFAULT_GREP_LIMIT = 100;
export const MAX_GREP_LINE_CHARS = 500;

// 运行初始化
export const SANDBOX_ENTRYPOINT_STATE_HASH_KEY = 'sandboxEntrypoint';
export const MAX_ENTRYPOINT_OUTPUT_BYTES = 8 * 1024;
export const MAX_LOG_OUTPUT_LENGTH = 4000;
export const SANDBOX_INIT_LEASE_TTL_MS = 180_000;
export const SANDBOX_INIT_LEASE_RENEW_INTERVAL_MS = 30_000;

// 分布式租约
export const SANDBOX_SOURCE_MUTATION_LEASE_TTL_MS = 660_000;
export const SANDBOX_LIFECYCLE_LEASE_TTL_MS = 660_000;
export const LEGACY_MIGRATION_JOB_LEASE_TTL_MS = 180_000;

// 容量与目录打包限制
export const MB_BYTES = 1024 * 1024;
export const RESERVED_DISK_MB = 150;
export const MAX_ARCHIVE_DEPTH = 20;
export const SESSION_VOLUME_GENERATION_LENGTH = 8;

// Skill Edit 对外错误约定
export const SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR = 'Edit sandbox not found or not running';
