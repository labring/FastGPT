/** Sandbox 内部状态、运行策略与限制常量；时间策略默认使用毫秒，其他单位在名称中明确。 */
// 生命周期状态与操作（5 态状态机）
export const sandboxInstanceStatusList = [
  'provisioning',
  'running',
  'stopping',
  'stopped',
  'deleting'
] as const;

export const SandboxInstanceStatusEnum = {
  provisioning: 'provisioning',
  running: 'running',
  stopping: 'stopping',
  stopped: 'stopped',
  deleting: 'deleting'
} as const satisfies Record<(typeof sandboxInstanceStatusList)[number], string>;

export const sandboxStableStatusList = ['running', 'stopped'] as const;

/**
 * 计入沙箱 Quota 的实例状态：占用远端容器资源，或正在创建/释放容器。
 * 系统总上限与团队配额共用同一个计数池（不区分 sourceType）。
 * 不计入 stopped（无远端计算资源）与 deleting（释放路径中的终态，不得被 Quota 阻塞）。
 */
export const sandboxActiveStatusList = [
  'provisioning',
  'running',
  'stopping'
] as const satisfies readonly (typeof sandboxInstanceStatusList)[number][];

export const sandboxOperationTypeList = ['provision', 'stop', 'delete'] as const;

export const SandboxOperationTypeEnum = {
  provision: 'provision',
  stop: 'stop',
  delete: 'delete'
} as const satisfies Record<(typeof sandboxOperationTypeList)[number], string>;

export const expectedOperationByStatus = {
  running: undefined,
  stopped: undefined,
  provisioning: 'provision',
  stopping: 'stop',
  deleting: 'delete'
} as const satisfies Record<
  (typeof sandboxInstanceStatusList)[number],
  (typeof sandboxOperationTypeList)[number] | undefined
>;

/** 后台恢复任务挑选疑似中断过渡态记录的心跳静默阈值；在途活跃任务仍由自动续租的 Redis Lifecycle Lease 保护。 */
export const SANDBOX_OPERATION_STALE_MS = 60_000;

/** 回滚阶段；只能沿持久化的清理方向续跑。 */
export const SANDBOX_ACTIVATION_ROLLBACK_PHASES = [
  'rollbackClaimed',
  'rollbackProviderReleased'
] as const;

// 资源清理批量策略
export const SOURCE_DELETE_CONCURRENCY = 10;

// 预览会话限制；TTL 使用 Redis EX 接口要求的秒
export const SANDBOX_PREVIEW_SESSION_TTL_SECONDS = 7_200;
export const SANDBOX_PREVIEW_SESSION_MAX_PER_SANDBOX = 500;

// 工具默认查询和输出限制
export const SANDBOX_TOOL_MAX_LINES = 2000;
export const SANDBOX_TOOL_MAX_BYTES = 50 * 1024;
export const DEFAULT_LS_LIMIT = 500;
export const DEFAULT_FIND_LIMIT = 1000;
export const DEFAULT_GREP_LIMIT = 100;
export const MAX_GREP_LINE_CHARS = 500;

// 运行初始化
export const SANDBOX_ENTRYPOINT_STATE_HASH_KEY = 'sandboxEntrypoint';
export const SKILL_ENTRYPOINT_STATE_LIST_KEY = 'skillEntrypoints';
export const MAX_ENTRYPOINT_OUTPUT_BYTES = 8 * 1024;
export const MAX_LOG_OUTPUT_LENGTH = 4000;
// 分布式租约（短 TTL + 自动续租：活进程无限续期，Pod 崩溃最多 30s 释放锁；前台有界排队，后台 cron 非阻塞）
export const SANDBOX_INIT_LEASE_TTL_MS = 30_000;
export const SANDBOX_INIT_LEASE_RENEW_INTERVAL_MS = 5_000;
export const SANDBOX_INIT_LEASE_WAIT_TIMEOUT_MS = 180_000;
export const SANDBOX_INIT_LEASE_RETRY_INTERVAL_MS = 50;

export const SANDBOX_LIFECYCLE_LEASE_TTL_MS = 30_000;
export const SANDBOX_LIFECYCLE_LEASE_RENEW_INTERVAL_MS = 5_000;
export const SANDBOX_LIFECYCLE_LEASE_WAIT_TIMEOUT_MS = 60_000;
export const SANDBOX_LIFECYCLE_LEASE_RETRY_INTERVAL_MS = 100;

// 容量与持久卷配置
export const MB_BYTES = 1024 * 1024;
export const RESERVED_DISK_MB = 150;
export const SESSION_VOLUME_GENERATION_LENGTH = 8;

// Skill Edit 对外错误约定
export const SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR = 'Edit sandbox not found or not running';
