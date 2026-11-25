/**
 * 检查 Sandbox 激活配额与 Docker 卷容量软限制。
 *
 * - 激活配额：Mongo 活跃实例数是唯一计数来源；检查与后续写入之间允许存在并发窗口。
 * - 卷容量软限制：仅 Docker 运行时生效，以容器内 `fastgpt-ide-agent` `GET /disk-usage` 为单一真相源与缓存；
 *   Kubernetes 交由原生 PVC 控制，此处零开销直接放行。
 */
import { OPEN_SANDBOX_DEFAULT_HOME_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import { getLogger, LogCategories } from '../../../../common/logger';
import {
  getAgentSandboxCommonConfig,
  getAgentSandboxDiskBytes,
  getAgentSandboxOpenSandboxConfig
} from '../config';
import {
  countActiveSandboxInstances,
  type SandboxResourceDoc
} from '../infrastructure/instance/repository';
import { isRecoverableSandboxError } from '../infrastructure/opensandbox/errors';
import { isSandboxActiveStatus } from '../type';
import {
  createAgentSandboxDiskQuotaExceededError,
  createAgentSandboxLimitReachedError,
  createAgentSandboxTeamLimitReachedError
} from '../error';
import { getSandboxDiskUsage, type IdeAgentEndpointClient } from './ideAgent';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

export type SandboxDiskQuotaStatus = {
  enabled: boolean;
  exceeded: boolean;
  usedBytes: number;
  limitBytes: number;
};

/**
 * 对已经确定团队归属的实例检查系统及团队 Quota。
 * 活跃记录跳过重复准入检查；非活跃实例超限抛业务错误。
 * Mongo 查询错误原样传播；检查与后续写入不是原子操作，允许并发超额。
 */
export async function checkSandboxQuota(identity: {
  teamId: string;
  current: SandboxResourceDoc | null;
}): Promise<void> {
  const current = identity.current;
  // 已占用配额的实例继续使用，不因当前配额已满而中断。
  if (current && isSandboxActiveStatus(current.status)) return;

  // 系统和团队共用活跃状态口径，系统上限先于团队上限检查。
  const { maxEditDebug, maxPerTeam } = getAgentSandboxCommonConfig();
  if ((await countActiveSandboxInstances()) >= maxEditDebug) {
    throw createAgentSandboxLimitReachedError();
  }
  if (
    maxPerTeam !== null &&
    maxPerTeam !== undefined &&
    (await countActiveSandboxInstances({ teamId: identity.teamId })) >= maxPerTeam
  ) {
    throw createAgentSandboxTeamLimitReachedError();
  }
}

/**
 * 构造面向 Agent 工具的磁盘容量超限提示。
 *
 * - 传入 `status`：Docker 卷软限制主动拦截/降级提示（含精确用量与 `RLIMIT_FSIZE=0` 说明）；
 * - 省略 `status`：K8s PVC 写满或执行期触发 `ENOSPC`/`SIGXFSZ` 时的通用提示；
 * - 明确禁止 Agent 擅自删除文件，引导其先排查占用并询问/建议用户确认清理。
 */
export function formatAgentDiskQuotaNotice(
  status: Pick<SandboxDiskQuotaStatus, 'usedBytes' | 'limitBytes'> | undefined,
  mode: 'write' | 'shell'
): string {
  const guidance = `Do NOT delete files automatically. You may inspect disk usage (e.g. \`du -sh ${OPEN_SANDBOX_DEFAULT_HOME_PATH}/* ${OPEN_SANDBOX_DEFAULT_HOME_PATH}/workspace/* 2>/dev/null\`), then inform the user and ask for their confirmation before deleting any files`;

  if (!status) {
    if (mode === 'shell') {
      return `[Sandbox disk space is full (${OPEN_SANDBOX_DEFAULT_HOME_PATH}). ${guidance}.]`;
    }
    return `Sandbox disk space is full (${OPEN_SANDBOX_DEFAULT_HOME_PATH}). Cannot create or modify files. ${guidance}.`;
  }

  const formatBytes = (bytes: number): string => {
    const gib = 1024 * 1024 * 1024;
    const mib = 1024 * 1024;
    return bytes >= gib ? `${(bytes / gib).toFixed(2)} GiB` : `${(bytes / mib).toFixed(1)} MiB`;
  };
  const usage = `${formatBytes(status.usedBytes)} / ${formatBytes(status.limitBytes)} used in ${OPEN_SANDBOX_DEFAULT_HOME_PATH}`;

  if (mode === 'shell') {
    return `[Sandbox disk quota exceeded (${usage}). Shell ran in read/delete-only mode (RLIMIT_FSIZE=0): file writes are blocked by the kernel. ${guidance}.]`;
  }
  return `Sandbox disk quota exceeded (${usage}). Cannot create or modify files. sandbox_shell is currently in read/delete-only mode (RLIMIT_FSIZE=0; file writes are blocked by the kernel). ${guidance}.`;
}

/**
 * 查询当前沙盒是否触发 Docker 卷容量软限制。
 *
 * Kubernetes 直接返回 `enabled: false`；Docker 探针异常或超时时默认 fail-open 放行并记录告警，
 * 当在 `SandboxClient.runWithRecovery` 内传入 `rethrowRecoverable: true` 时透传可恢复传输异常以便自愈重建。
 */
export async function getSandboxDiskQuotaStatus(
  sandbox: IdeAgentEndpointClient,
  options: { refresh?: boolean; signal?: AbortSignal; rethrowRecoverable?: boolean } = {}
): Promise<SandboxDiskQuotaStatus> {
  const limitBytes = getAgentSandboxDiskBytes();
  const enabled = getAgentSandboxOpenSandboxConfig().runtime === 'docker';
  if (!enabled) {
    return { enabled, exceeded: false, usedBytes: 0, limitBytes };
  }

  try {
    const usage = await getSandboxDiskUsage({
      sandbox,
      refresh: options.refresh,
      signal: options.signal
    });
    // 优先使用容器启动时注入的限额，保证主站与容器内 IDE 判定口径一致。
    const effectiveLimitBytes = usage.limitBytes || limitBytes;
    return {
      enabled: true,
      exceeded: usage.usedBytes >= effectiveLimitBytes,
      usedBytes: usage.usedBytes,
      limitBytes: effectiveLimitBytes
    };
  } catch (error) {
    if (options.rethrowRecoverable && isRecoverableSandboxError(error)) {
      throw error;
    }
    logger.warn('[Sandbox DiskQuota] Failed to probe sandbox disk usage, failing open', {
      sandboxId: sandbox.id,
      error
    });
    return { enabled: true, exceeded: false, usedBytes: 0, limitBytes };
  }
}

/** 校验用户态写入口（上传、附件注入）是否允许写入；Docker 超限时抛出业务错误码。 */
export async function assertSandboxWorkspaceWritable(
  sandbox: IdeAgentEndpointClient,
  options?: { refresh?: boolean; signal?: AbortSignal; rethrowRecoverable?: boolean }
): Promise<void> {
  const status = await getSandboxDiskQuotaStatus(sandbox, options);
  if (status.exceeded) {
    throw createAgentSandboxDiskQuotaExceededError();
  }
}
