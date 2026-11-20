import type { SandboxResourceDoc } from '../../infrastructure/instance/repository';
import {
  SANDBOX_ACTIVATION_ROLLBACK_PHASES,
  SANDBOX_CREATE_UNCERTAIN_TIMEOUT_MS,
  SANDBOX_STALE_OPERATION_TIMEOUT_MS
} from '../../constants';
import { LEGACY_ROLLBACK_PROVIDER_DELETED_PHASE } from '../../legacy';

export const SANDBOX_RECOVERABLE_ROLLBACK_PHASES = [
  ...SANDBOX_ACTIVATION_ROLLBACK_PHASES,
  LEGACY_ROLLBACK_PROVIDER_DELETED_PHASE
] as const;

/** 回滚是已持久化的操作方向；兼容旧 checkpoint，不从错误文本推断方向。 */
export const isSandboxActivationRollback = (resource: SandboxResourceDoc) =>
  SANDBOX_RECOVERABLE_ROLLBACK_PHASES.some((phase) => phase === resource.operation?.phase);

/**
 * 判断当前过渡态阶段是否可能存在尚未返回响应的 `POST /sandboxes` 在途创建请求：
 * - `provisioning:claimed`、`restoring:volumeAssigned` 会触发新容器创建；
 * - 静态 `stopped` 或缺失 `instanceId` 的 `archiving:claimed` 也可能拉起临时容器打包。
 */
function mayHaveInFlightSandboxCreate(
  resource: Pick<SandboxResourceDoc, 'status' | 'instanceId' | 'operation'>
): boolean {
  const phase = resource.operation?.phase;
  if (resource.status === 'provisioning') return phase === 'claimed';
  if (resource.status === 'restoring') return phase === 'volumeAssigned';
  if (resource.status === 'archiving' && phase === 'claimed') {
    return !resource.instanceId || resource.operation?.previousStatus === 'stopped';
  }
  return false;
}

/** 返回与当前阶段匹配的孤儿接管 / 未决控制面冷却窗口（可能存在在途创建时为 240s，其余阶段为 60s）。 */
export const getStaleOperationTimeoutMs = (
  resource: Pick<SandboxResourceDoc, 'status' | 'instanceId' | 'operation'>
): number =>
  mayHaveInFlightSandboxCreate(resource)
    ? SANDBOX_CREATE_UNCERTAIN_TIMEOUT_MS
    : SANDBOX_STALE_OPERATION_TIMEOUT_MS;

/**
 * 判断过渡态 operation 是否允许被当前持锁调用方接管恢复：
 * - 已明确记录 `retryAfter` 的失败记录按 `retryAfter <= now` 判定；
 * - 节点崩溃/重启遗留的无 `retryAfter` 孤儿记录按 `heartbeatAt` 超过当前阶段对应阈值（240s 创建未决 / 60s 其余阶段）判定。
 */
export function canResumeSandboxOperation(resource: SandboxResourceDoc, now = new Date()) {
  const operation = resource.operation;
  if (!operation) return false;
  if (operation.retryAfter) return operation.retryAfter <= now;
  return operation.heartbeatAt.getTime() <= now.getTime() - getStaleOperationTimeoutMs(resource);
}

/** 先遵守新失败的 retryAfter；旧回滚记录仅续跑清理，无 retryAfter 的正向孤儿记录等待心跳超时。 */
export function isSandboxActivationRecoverable(
  resource: SandboxResourceDoc,
  now = new Date()
): resource is SandboxResourceDoc & { status: 'provisioning' | 'restoring' } {
  return (
    (resource.status === 'provisioning' || resource.status === 'restoring') &&
    (resource.operation?.retryAfter
      ? canResumeSandboxOperation(resource, now)
      : isSandboxActivationRollback(resource) || canResumeSandboxOperation(resource, now))
  );
}
