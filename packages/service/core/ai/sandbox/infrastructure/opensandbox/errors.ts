import {
  SandboxApiException,
  SandboxReadyTimeoutException,
  SandboxUnhealthyException
} from '@alibaba-group/opensandbox';

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

const MAX_ERROR_CAUSE_DEPTH = 8;

/**
 * 判断异常是否表示沙盒内目标文件不存在（如 OpenSandbox `FILE_NOT_FOUND` 或 POSIX `ENOENT`），
 * 与整个沙盒容器不存在（404）区分开，避免把容器丢失误判为文件缺失。
 */
export function isSandboxFileNotFoundError(error: unknown, depth = 0): boolean {
  if (depth >= MAX_ERROR_CAUSE_DEPTH || !error || typeof error !== 'object') {
    return false;
  }
  if (error instanceof SandboxApiException) {
    return (
      error.error?.code === 'FILE_NOT_FOUND' ||
      (typeof error.rawBody === 'string' && error.rawBody.includes('"FILE_NOT_FOUND"'))
    );
  }
  if ('code' in error && (error.code === 'FILE_NOT_FOUND' || error.code === 'ENOENT')) {
    return true;
  }
  if ('cause' in error && error.cause && error.cause !== error) {
    return isSandboxFileNotFoundError(error.cause, depth + 1);
  }
  return false;
}

/**
 * 判断底层异常是否代表远端容器丢失或连接中断，适合触发慢路径自愈重建并重试一次。
 */
export function isRecoverableSandboxError(error: unknown, depth = 0): boolean {
  if (depth >= MAX_ERROR_CAUSE_DEPTH) return false;
  if (isSandboxFileNotFoundError(error)) {
    return false;
  }
  if (error instanceof SandboxNotFoundError || error instanceof SandboxStateError) {
    return true;
  }
  if (error instanceof SandboxApiException) {
    return (
      error.statusCode === 404 ||
      error.statusCode === 502 ||
      error.statusCode === 503 ||
      error.statusCode === 504
    );
  }
  if (error && typeof error === 'object') {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
    const message = 'message' in error ? String(error.message) : '';
    const networkPattern =
      /ENOTCONN|Transport endpoint is not connected|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET|fetch failed/i;
    if (networkPattern.test(code) || networkPattern.test(message)) {
      return true;
    }
    if ('cause' in error && error.cause && error.cause !== error) {
      return isRecoverableSandboxError(error.cause, depth + 1);
    }
  }
  return false;
}

/**
 * 判断异常是否属于「控制面请求已发出但未收到服务端明确终态」的未决传输异常：
 * - 仅针对 OpenSandbox 控制面 `ConnectionError`（如 `POST /sandboxes` 或 `DELETE` 遭遇底层连接重置、请求超时或网关 `502/503/504`）；
 * - 若服务端已返回确定性业务响应（如 `4xx/500`、K8s `KUBERNETES::POD_READY_TIMEOUT` 已回滚删除 CR）或已进入 `waitUntilReady` 轮询阶段（SDK 内部已拿到 `id` 并自动清理），则控制面状态确定，返回 `false`；
 * - 数据面（如 `/restore`、`/archive`、S3 流）异常不包装为控制面 `ConnectionError`，直接返回 `false` 允许立即回滚释放配额。
 */
export function isUncertainControlPlaneError(error: unknown): boolean {
  if (!(error instanceof ConnectionError)) {
    return false;
  }

  let current: unknown = error.cause;
  if (current === undefined || current === null) {
    return false;
  }

  for (let depth = 0; depth < MAX_ERROR_CAUSE_DEPTH && current; depth += 1) {
    if (
      current instanceof SandboxReadyTimeoutException ||
      current instanceof SandboxUnhealthyException ||
      current instanceof SandboxStateError ||
      current instanceof SandboxNotFoundError
    ) {
      return false;
    }
    if (current instanceof SandboxApiException) {
      // K8s wait_for_sandbox_ready 超时返回 504 + KUBERNETES::POD_READY_TIMEOUT，服务端已回滚删除 workload CR，属于确定性失败。
      if (current.error?.code === 'KUBERNETES::POD_READY_TIMEOUT') {
        return false;
      }
      const status = current.statusCode;
      return status === undefined || status === 502 || status === 503 || status === 504;
    }
    current =
      typeof current === 'object' && 'cause' in current && current.cause !== current
        ? current.cause
        : undefined;
  }

  return true;
}
