/** 当前生命周期尚未收敛（例如正在 deleting），调用方应等待或放弃，不能绕过 operation 执行远端动作。 */
export class SandboxLifecycleStateError extends Error {
  constructor(
    readonly state: string,
    message = `Sandbox is ${state}`
  ) {
    super(message);
    this.name = 'SandboxLifecycleStateError';
  }
}

/** CAS 未抢占到预期快照；批处理可以跳过，交互入口应重新读取或等待。 */
export class SandboxOperationConflictError extends Error {
  constructor(sandboxId: string) {
    super(`Sandbox ${sandboxId} changed before operation claim`);
    this.name = 'SandboxOperationConflictError';
  }
}
