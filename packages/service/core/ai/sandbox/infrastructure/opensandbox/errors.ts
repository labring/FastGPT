/** OpenSandbox 控制面与数据面统一异常基类，保留错误码与底层 cause 供上层分类处理。 */
export class SandboxException extends Error {
  readonly code: string;

  constructor(
    message: string,
    options?: {
      code?: string;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options?.cause });
    this.code = options?.code ?? 'INTERNAL_UNKNOWN_ERROR';
    this.name = 'SandboxException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** OpenSandbox 控制面或数据面连接异常。 */
export class ConnectionError extends SandboxException {
  readonly endpoint?: string;

  constructor(
    message: string,
    options?: {
      endpoint?: string;
      cause?: unknown;
    }
  ) {
    super(message, { code: 'CONNECTION_ERROR', cause: options?.cause });
    this.endpoint = options?.endpoint;
    this.name = 'ConnectionError';
  }
}

/** 远端沙盒实例不存在异常（404 / 已销毁），供运行态自愈与幂等清理识别。 */
export class SandboxNotFoundError extends SandboxException {
  constructor(message: string) {
    super(message, { code: 'SANDBOX_NOT_FOUND' });
    this.name = 'SandboxNotFoundError';
  }
}

/** 远端沙盒状态不符合操作前提（如非 Running 或工作区挂载不健康），供运行态触发重建收敛。 */
export class SandboxStateError extends SandboxException {
  readonly currentState: string;
  readonly requiredState?: string;

  constructor(
    message: string,
    state: {
      currentState: string;
      requiredState?: string;
    }
  ) {
    super(
      `Invalid sandbox state: ${message} (current: ${state.currentState}${state.requiredState ? `, required: ${state.requiredState}` : ''})`,
      { code: 'INVALID_STATE' }
    );
    this.currentState = state.currentState;
    this.requiredState = state.requiredState;
    this.name = 'SandboxStateError';
  }
}

/** 沙盒内命令流执行异常，附带原始命令与底层错误原因。 */
export class CommandExecutionError extends SandboxException {
  readonly command: string;

  constructor(
    message: string,
    options: {
      command: string;
      cause?: Error;
    }
  ) {
    super(message, { code: 'COMMAND_FAILED', cause: options.cause });
    this.command = options.command;
    this.name = 'CommandExecutionError';
  }
}
