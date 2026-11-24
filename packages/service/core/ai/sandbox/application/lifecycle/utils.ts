import type { SandboxResourceDoc } from '../../infrastructure/instance/repository';
import {
  SANDBOX_ACTIVATION_ROLLBACK_PHASES,
  SANDBOX_OPERATION_ISOLATION_MS
} from '../../constants';

/** 回滚是已持久化的操作方向；兼容旧 checkpoint，不从错误文本推断方向。 */
export const isSandboxActivationRollback = (resource: SandboxResourceDoc) =>
  SANDBOX_ACTIVATION_ROLLBACK_PHASES.some((phase) => phase === resource.operation?.phase);

/** 明确结束的失败使用 retryAfter；历史错误和结果未知的失败等待 heartbeat 隔离窗口。 */
export function canResumeSandboxOperation(resource: SandboxResourceDoc, now = new Date()) {
  const operation = resource.operation;
  if (!operation) return false;
  if (operation.retryAfter) return operation.retryAfter <= now;
  return (
    operation.heartbeatAt.getTime() <=
    now.getTime() - SANDBOX_OPERATION_ISOLATION_MS[operation.type]
  );
}

/**
 * 先遵守新失败的 retryAfter；旧回滚记录仅续跑清理，正向旧记录等待 heartbeat 隔离。
 *
 * 这里不再做第二次终止分类：provider 边界的结构化判定已在 runner 写入
 * `retryAfter`（终止即 now），因此 `canResumeSandboxOperation` 自然放行；
 * 缺失 retryAfter 的记录继续沿用隔离窗口。
 */
export function isSandboxActivationRecoverable(
  resource: SandboxResourceDoc,
  now = new Date()
): resource is SandboxResourceDoc & { status: 'provisioning' | 'restoring' } {
  if (resource.status !== 'provisioning' && resource.status !== 'restoring') return false;
  return resource.operation?.retryAfter
    ? canResumeSandboxOperation(resource, now)
    : isSandboxActivationRollback(resource) || canResumeSandboxOperation(resource, now);
}
