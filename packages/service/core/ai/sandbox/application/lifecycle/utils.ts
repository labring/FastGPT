import type { SandboxResourceDoc } from '../../infrastructure/instance/repository';
import {
  SANDBOX_ACTIVATION_ROLLBACK_PHASES,
  SANDBOX_OPERATION_ISOLATION_MS
} from '../../constants';
import { isSettledSandboxFailure, isSettledSandboxFailureCode } from '../../error';

/** 回滚是已持久化的操作方向；兼容旧 checkpoint，不从错误文本推断方向。 */
export const isSandboxActivationRollback = (resource: SandboxResourceDoc) =>
  SANDBOX_ACTIVATION_ROLLBACK_PHASES.some((phase) => phase === resource.operation?.phase);

/**
 * 已知确定失败的 old 记录（含部署前写入的 5 分钟 retryAfter）可直接清理重建。
 *
 * 远端已明确结束的失败（容器非 0 退出、配额拒绝等）不存在“可能仍在执行”的歧义，
 * 不应继续受隔离窗口约束，否则用户会看到失败后一段时间内怎么重试都不生效。
 * 新记录优先看结构化 errorCode；历史记录（无 errorCode）仅当 error 文本命中终止特征时
 * 才提前恢复，避免把未知结果误判成确定失败。
 */
const isSettledOperationFailure = (resource: SandboxResourceDoc) => {
  const operation = resource.operation;
  if (!operation) return false;
  if (operation.errorCode) return isSettledSandboxFailureCode(operation.errorCode);
  return Boolean(operation.error) && isSettledSandboxFailure(operation.error);
};

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

/** 先遵守新失败的 retryAfter；旧回滚记录仅续跑清理，正向旧记录等待 heartbeat 隔离。 */
export function isSandboxActivationRecoverable(
  resource: SandboxResourceDoc,
  now = new Date()
): resource is SandboxResourceDoc & { status: 'provisioning' | 'restoring' } {
  if (resource.status !== 'provisioning' && resource.status !== 'restoring') return false;
  // 已明确失败的实例直接允许下一次初始化清理重建，不等隔离窗口。
  if (isSettledOperationFailure(resource)) return true;
  return resource.operation?.retryAfter
    ? canResumeSandboxOperation(resource, now)
    : isSandboxActivationRollback(resource) || canResumeSandboxOperation(resource, now);
}
