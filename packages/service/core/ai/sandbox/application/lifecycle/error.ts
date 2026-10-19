/** 当前生命周期尚未收敛，调用方应等待后重试，不能绕过 operation 执行远端动作。 */
export class SandboxLifecycleStateError extends Error {
  constructor(
    readonly state: string,
    message = `Sandbox is ${state}`
  ) {
    super(message);
    this.name = 'SandboxLifecycleStateError';
  }
}

/** 已收到明确的执行终态；当前阶段允许立即幂等重试，不用于网络中断或超时。 */
export class SandboxOperationSettledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxOperationSettledError';
  }
}

/** CAS 未抢占到预期快照；批处理可以跳过，交互入口应重新读取或等待。 */
export class SandboxOperationConflictError extends Error {
  constructor(sandboxId: string) {
    super(`Sandbox ${sandboxId} changed before operation claim`);
    this.name = 'SandboxOperationConflictError';
  }
}
