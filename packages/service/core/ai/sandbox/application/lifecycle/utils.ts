import type { SandboxResourceDoc } from '../../infrastructure/instance/repository';
import {
  SANDBOX_ACTIVATION_ROLLBACK_PHASES,
  SANDBOX_CREATE_UNCERTAIN_TIMEOUT_MS,
  SANDBOX_STALE_OPERATION_TIMEOUT_MS,
  SandboxInstanceStatusEnum
} from '../../constants';

export const ARCHIVING_ROLLBACK_RESUME_PHASES = [
  'rollbackClaimed',
  'rollbackProviderReleased'
] as const;

/** 回滚是已持久化的操作方向；不从错误文本推断方向。 */
export const isSandboxActivationRollback = (resource: SandboxResourceDoc) =>
  SANDBOX_ACTIVATION_ROLLBACK_PHASES.some((phase) => phase === resource.operation?.phase);

/**
 * 判断当前过渡态阶段是否可能存在尚未返回响应的 `POST /sandboxes` 在途创建请求：
 * - `provisioning:claimed`、`restoring:volumeAssigned` 会触发新容器创建；
 * - 从静态 `stopped` 启动的 `archiving:claimed` 也可能拉起临时容器打包。
 */
function mayHaveInFlightSandboxCreate(
  resource: Pick<SandboxResourceDoc, 'status' | 'operation'>
): boolean {
  const phase = resource.operation?.phase;
  if (resource.status === 'provisioning') return phase === 'claimed';
  if (resource.status === 'restoring') return phase === 'volumeAssigned';
  if (resource.status === 'archiving' && phase === 'claimed') {
    return resource.operation?.previousStatus === 'stopped';
  }
  return false;
}

/** 返回与当前阶段匹配的孤儿接管 / 未决控制面冷却窗口（可能存在在途创建时为 240s，其余阶段为 60s）。 */
export const getStaleOperationTimeoutMs = (
  resource: Pick<SandboxResourceDoc, 'status' | 'operation'>
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

const isOperationRecoverableWithRollbackPhases = ({
  resource,
  rollbackPhases,
  now
}: {
  resource: SandboxResourceDoc;
  rollbackPhases: readonly string[];
  now?: Date;
}): boolean => {
  if (resource.operation?.retryAfter) {
    return canResumeSandboxOperation(resource, now);
  }
  const phase = resource.operation?.phase;
  const inRollbackPhase = rollbackPhases.some((rollbackPhase) => rollbackPhase === phase);
  return inRollbackPhase || canResumeSandboxOperation(resource, now);
};

/** 判断 archiving 记录是否已到可由后台任务或恢复入口接管的时机。 */
export function isArchivingOperationRecoverable(
  resource: SandboxResourceDoc,
  now = new Date()
): boolean {
  if (resource.status !== SandboxInstanceStatusEnum.archiving) return false;
  if (resource.operation?.type !== 'archive') return false;
  return isOperationRecoverableWithRollbackPhases({
    resource,
    rollbackPhases: ARCHIVING_ROLLBACK_RESUME_PHASES,
    now
  });
}

/** 先遵守新失败的 retryAfter；旧回滚记录仅续跑清理，无 retryAfter 的正向孤儿记录等待心跳超时。 */
export function isSandboxActivationRecoverable(
  resource: SandboxResourceDoc,
  now = new Date()
): resource is SandboxResourceDoc & { status: 'provisioning' | 'restoring' } {
  return (
    (resource.status === SandboxInstanceStatusEnum.provisioning ||
      resource.status === SandboxInstanceStatusEnum.restoring) &&
    isOperationRecoverableWithRollbackPhases({
      resource,
      rollbackPhases: SANDBOX_ACTIVATION_ROLLBACK_PHASES,
      now
    })
  );
}
