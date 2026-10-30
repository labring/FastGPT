/**
 * 权限同步的协作式截止控制。
 *
 * `withTimeout` 只是 `Promise.race`，不会取消底层 Promise；任务超时后旧 job 仍可能继续
 * 拉取和写入。这里把截止时间向下传递，让各阶段在关键节点主动停止，避免超时任务与新任务
 * 同时写 ACL。
 */

export class PermissionSyncDeadlineError extends Error {
  constructor(message = 'Permission sync deadline exceeded') {
    super(message);
    this.name = 'PermissionSyncDeadlineError';
  }
}

/**
 * 到达截止时间即抛出 `PermissionSyncDeadlineError`。
 *
 * 未传 `deadlineAt`（例如手动触发的定向同步）时不做限制。
 */
export const assertPermissionSyncDeadline = (deadlineAt?: number): void => {
  if (deadlineAt !== undefined && Date.now() >= deadlineAt) {
    throw new PermissionSyncDeadlineError();
  }
};

/**
 * 计算本次操作可用的超时时间：不超过默认上限，也不超过剩余截止时间。
 * 返回 `<= 0` 表示已经过期，调用方应立即中止。
 */
export const getRemainingTimeoutMs = ({
  deadlineAt,
  maxTimeoutMs
}: {
  deadlineAt?: number;
  maxTimeoutMs: number;
}): number => {
  if (deadlineAt === undefined) return maxTimeoutMs;
  return Math.min(maxTimeoutMs, deadlineAt - Date.now());
};
