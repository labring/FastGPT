/** Sandbox 内部状态、运行策略与限制常量；时间策略默认使用毫秒，其他单位在名称中明确。 */
// 生命周期状态与操作
export const sandboxInstanceStatusList = [
  'provisioning',
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
 * 计入沙箱 Quota 的实例状态：占用或正在激活/释放计算容器，不含 stopped/archived/deleting 以及正在冷归档回收的 archiving。
 * 系统总上限与团队配额共用同一个计数池（忽略 provider 与 sourceType）。
 * archiving 与 deleting 同样处于资源下线释放路径，不得被 Quota 阻塞。
 */
export const sandboxActiveStatusList = [
  'provisioning',
  'running',
  'stopping',
  'restoring'
] as const satisfies readonly (typeof sandboxInstanceStatusList)[number][];

export const sandboxOperationTypeList = [
  'provision',
  'stop',
  'archive',
  'restore',
  'delete'
] as const;

export const SandboxOperationTypeEnum = {
  provision: 'provision',
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
  stopping: 'stop',
  archiving: 'archive',
  restoring: 'restore',
  deleting: 'delete'
} as const satisfies Record<
  (typeof sandboxInstanceStatusList)[number],
  (typeof sandboxOperationTypeList)[number] | undefined
>;

// OpenSandbox HTTP 响应头超时（秒）：常规控制面保持 SDK 默认 30s；POST /sandboxes 在 Docker/K8s
// 端会同步阻塞到镜像拉取/Pod 就绪，单独放宽到 210s 以覆盖 Docker 默认 180s api_timeout。
export const OPEN_SANDBOX_REQUEST_TIMEOUT_SECONDS = 30;
export const OPEN_SANDBOX_CREATE_REQUEST_TIMEOUT_SECONDS = 210;

/**
 * 孤儿或控制面传输未决操作的安全接管超时窗口与运行期持久化心跳刷新间隔（15s）：
 * - OpenSandbox 1.2.1 的 `POST /sandboxes` 会同步等待容器创建/拉镜像（Docker 后台 daemon thread 默认 180s、K8s 等待 Pod 就绪默认 60s）后才返回 `202`；
 *   常规控制面请求保持 30s 超时，`Sandbox.create` 单独使用 210s 超时并透传 `lease.signal`；
 * - 正常长耗时步骤持有 30s 自动续租 Redis Lease 期间，每 15s 刷新一次 Mongo `operation.heartbeatAt`；
 * - 确定性业务/数据面失败写入 `retryAfter = now` 允许立即接管回滚；非创建阶段或已推进到创建之后的阶段等待 60s（`SANDBOX_STALE_OPERATION_TIMEOUT_MS`）；
 * - 仍可能存在未决 `POST /sandboxes` 在途线程的阶段（如 `provisioning:claimed` / `restoring:volumeAssigned` / 静态起容 `archiving:claimed`）遭遇崩溃或控制面传输未决异常时，
 *   等待 240s（`210s` create 超时 + `30s` 余量）后接管，并结合 `metadata.operationId` 围栏主动回收任何迟到旧容器。
 */
export const SANDBOX_STALE_OPERATION_TIMEOUT_MS = 60_000;
export const SANDBOX_CREATE_UNCERTAIN_TIMEOUT_MS =
  (OPEN_SANDBOX_CREATE_REQUEST_TIMEOUT_SECONDS + 30) * 1000;
export const SANDBOX_OPERATION_HEARTBEAT_INTERVAL_MS = 15_000;

/** 当前版本恢复（`restoring`）激活的正向阶段列表；旧版清理阶段在 `legacy/index.ts` 中额外兼容。 */
export const SANDBOX_RESTORE_FORWARD_PHASES = [
  'claimed',
  'volumeAssigned',
  'archiveInstalled'
] as const;

/** 已进入激活回滚的持久化阶段；这些阶段只能沿持久化的清理方向续跑（旧版 `rollbackProviderDeleted` 已收口至 `legacy/index.ts`）。 */
export const SANDBOX_ACTIVATION_ROLLBACK_PHASES = [
  'rollbackClaimed',
  'rollbackProviderReleased',
  'rollbackVolumeReleased'
] as const;

// 归档与资源清理批量策略
export const SANDBOX_ARCHIVE_CONCURRENCY = 2;
export const SANDBOX_ARCHIVE_CURSOR_BATCH_SIZE = 100;
export const SOURCE_DELETE_CONCURRENCY = 10;

// 孤儿持久卷两阶段观察与优雅窗口
export const ORPHAN_VOLUME_OBSERVATION_TTL_SECONDS = 7_200;
export const ORPHAN_VOLUME_GRACE_PERIOD_MS = 1_800_000;

// 归档与恢复 HTTP 流超时上限（10 分钟）
export const SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS = 600_000;

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

// 入口超时及 WebSocket 容量采用固定策略，Proxy 与 IDE Agent 使用相同上限。
export const SANDBOX_ENTRYPOINT_TIMEOUT_SECONDS = 60;
export const SANDBOX_WS_MAX_MESSAGE_BYTES = 64 * 1024 * 1024;
export const SANDBOX_WS_MAX_FRAME_BYTES = 16 * 1024 * 1024;

// 运行初始化
export const SANDBOX_ENTRYPOINT_STATE_HASH_KEY = 'sandboxEntrypoint';
export const SKILL_ENTRYPOINT_STATE_LIST_KEY = 'skillEntrypoints';
export const MAX_ENTRYPOINT_OUTPUT_BYTES = 8 * 1024;
export const MAX_LOG_OUTPUT_LENGTH = 4000;
// 统一可重入分布式租约（短 TTL + 自动续租：活进程自动续期，Pod 崩溃最多 30s 释放锁；前台指数退避有界排队，后台 cron 非阻塞）
export const SANDBOX_LEASE_TTL_MS = 30_000;
export const SANDBOX_LEASE_RENEW_INTERVAL_MS = 5_000;
export const SANDBOX_LEASE_WAIT_TIMEOUT_MS = 180_000;
export const SANDBOX_LEASE_RETRY_INITIAL_MS = 40;
export const SANDBOX_LEASE_RETRY_MAX_MS = 400;

// 容量与目录打包限制
export const MB_BYTES = 1024 * 1024;
export const MAX_ARCHIVE_DEPTH = 20;
export const SESSION_VOLUME_GENERATION_LENGTH = 8;
export const MANAGED_SESSION_VOLUME_CLAIM_REST_RE = new RegExp(
  `^(.+)-(?:0|[0-9a-f]{${SESSION_VOLUME_GENERATION_LENGTH}})$`
);

// Skill Edit 对外错误约定
export const SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR = 'Edit sandbox not found or not running';
