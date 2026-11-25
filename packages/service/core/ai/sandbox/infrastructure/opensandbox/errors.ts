import {
  SandboxApiException,
  SandboxReadyTimeoutException,
  SandboxUnhealthyException
} from '@alibaba-group/opensandbox';

/** OpenSandbox 控制面与数据面内部异常基类，保留错误码与底层 cause 供上层分类处理。 */
class SandboxException extends Error {
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
  constructor(
    message: string,
    options?: {
      cause?: unknown;
    }
  ) {
    super(message, { code: 'SANDBOX_NOT_FOUND', cause: options?.cause });
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
      cause?: unknown;
    }
  ) {
    super(
      `Invalid sandbox state: ${message} (current: ${state.currentState}${state.requiredState ? `, required: ${state.requiredState}` : ''})`,
      { code: 'INVALID_STATE', cause: state.cause }
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

const TRANSIENT_TRANSPORT_PATTERN =
  /ENOTCONN|Transport endpoint is not connected|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ETIMEDOUT|EPIPE|UND_ERR_|fetch failed/i;

const DISK_FULL_PATTERN = /\b(?:ENOSPC|EDQUOT)\b|no space left on device|disk quota exceeded/i;
const FSIZE_LIMIT_PATTERN = /\bSIGXFSZ\b|file size limit exceeded/i;

/** 沿 `cause` 链（含循环引用防护与最大深度限制）迭代错误对象节点。 */
function* iterCauseChain(error: unknown, maxDepth = MAX_ERROR_CAUSE_DEPTH): Generator<object> {
  let current: unknown = error;
  const visited = new Set<object>();
  for (let depth = 0; depth < maxDepth && current && typeof current === 'object'; depth += 1) {
    if (visited.has(current)) return;
    visited.add(current);
    yield current;
    current = 'cause' in current && current.cause !== current ? current.cause : undefined;
  }
}

/** 沿 `cause` 链（含循环引用防护）判断是否命中指定异常条件。 */
export function hasMatchingErrorInCauseChain({
  error,
  predicate,
  maxDepth = MAX_ERROR_CAUSE_DEPTH
}: {
  error: unknown;
  predicate: (err: unknown) => boolean;
  maxDepth?: number;
}): boolean {
  for (const current of iterCauseChain(error, maxDepth)) {
    if (predicate(current)) return true;
  }
  return false;
}

const isFileNotFoundException = (current: unknown): boolean => {
  if (current instanceof SandboxApiException) {
    return (
      current.error?.code === 'FILE_NOT_FOUND' ||
      (typeof current.rawBody === 'string' && current.rawBody.includes('"FILE_NOT_FOUND"'))
    );
  }
  return (
    typeof current === 'object' &&
    current !== null &&
    'code' in current &&
    (current.code === 'FILE_NOT_FOUND' || current.code === 'ENOENT')
  );
};

/**
 * 判断异常或其 `cause` 链是否表示沙盒持久卷空间已满（`ENOSPC` / `EDQUOT` / `No space left on device`）。
 */
export function isSandboxDiskFullError(error: unknown): boolean {
  for (const current of iterCauseChain(error)) {
    if (current instanceof SandboxApiException) {
      if (
        [current.error?.code, current.error?.message, current.rawBody, current.message].some(
          (part) => typeof part === 'string' && DISK_FULL_PATTERN.test(part)
        )
      ) {
        return true;
      }
      continue;
    }
    const code = 'code' in current && typeof current.code === 'string' ? current.code : '';
    const message =
      'message' in current && typeof current.message === 'string' ? current.message : '';
    if (DISK_FULL_PATTERN.test(code) || DISK_FULL_PATTERN.test(message)) {
      return true;
    }
  }
  return false;
}

/**
 * 判断沙盒命令非零退出是否由磁盘写满或 `RLIMIT_FSIZE`（`SIGXFSZ` / `153`）导致。
 *
 * 仅在 `exitCode` 非零时生效，避免 `grep`/`cat` 正常输出包含相关字样时误判。
 */
export function isSandboxCommandDiskFull(params: {
  exitCode: number | null;
  output: string;
}): boolean {
  if (params.exitCode === 0 || params.exitCode === null) {
    return false;
  }
  return (
    params.exitCode === 153 ||
    DISK_FULL_PATTERN.test(params.output) ||
    FSIZE_LIMIT_PATTERN.test(params.output)
  );
}

/**
 * 判断异常是否表示沙盒内目标文件不存在（如 OpenSandbox `FILE_NOT_FOUND` 或 POSIX `ENOENT`），
 * 与整个沙盒容器不存在（404）区分开，避免把容器丢失误判为文件缺失。
 */
export function isSandboxFileNotFoundError(error: unknown): boolean {
  return hasMatchingErrorInCauseChain({
    error,
    predicate: isFileNotFoundException
  });
}

/**
 * 判断单个 `SandboxApiException` 是否明确表示远端容器已不存在（404）：
 * 排除数据面文件缺失（`FILE_NOT_FOUND`）与 Pod 启动分配 IP 期间的瞬时 404（`KUBERNETES::POD_IP_NOT_AVAILABLE`）。
 */
export function isSandboxContainerNotFoundApiError(error: unknown): boolean {
  if (!(error instanceof SandboxApiException) || error.statusCode !== 404) {
    return false;
  }
  if (isFileNotFoundException(error)) {
    return false;
  }
  return error.error?.code !== 'KUBERNETES::POD_IP_NOT_AVAILABLE';
}

const isTransientTransportError = (current: object): boolean => {
  const name = 'name' in current && typeof current.name === 'string' ? current.name : '';
  const code = 'code' in current && typeof current.code === 'string' ? current.code : '';
  const message = 'message' in current ? String(current.message) : '';
  return (
    name === 'TimeoutError' ||
    TRANSIENT_TRANSPORT_PATTERN.test(code) ||
    TRANSIENT_TRANSPORT_PATTERN.test(message)
  );
};

const isConfirmedSandboxUnavailableNode = (current: unknown): boolean =>
  current instanceof SandboxNotFoundError ||
  current instanceof SandboxStateError ||
  isSandboxContainerNotFoundApiError(current);

const isTransientSandboxConnectNode = (current: unknown): boolean => {
  if (current instanceof SandboxReadyTimeoutException) {
    return true;
  }
  if (current instanceof SandboxApiException) {
    return (
      current.statusCode === 502 ||
      current.statusCode === 503 ||
      current.statusCode === 504 ||
      (current.statusCode === 404 && current.error?.code === 'KUBERNETES::POD_IP_NOT_AVAILABLE')
    );
  }
  return Boolean(current && typeof current === 'object' && isTransientTransportError(current));
};

/**
 * 判断异常或其 `cause` 链是否**明确证实**远端容器已销毁、非 Running 终态或工作区明确不健康。
 *
 * 这是运行态触发 `stop -> 重建` 及数据面非重连放弃的唯一真值边界；瞬时 502/503/504、网络错误
 * 与仅因探测超时的 `SandboxReadyTimeoutException`（非明确非目录返回值）绝不命中。
 */
export function isConfirmedSandboxUnavailableError(error: unknown): boolean {
  if (isSandboxFileNotFoundError(error)) {
    return false;
  }
  return hasMatchingErrorInCauseChain({
    error,
    predicate: isConfirmedSandboxUnavailableNode
  });
}

/**
 * 判断连接/探测异常是否属于结果未决的瞬时网关、传输或就绪超时错误（不含已确认的容器失效与文件缺失）。
 */
export function isTransientSandboxConnectError(error: unknown): boolean {
  let hasTransient = false;
  for (const current of iterCauseChain(error)) {
    if (isFileNotFoundException(current) || isConfirmedSandboxUnavailableNode(current)) {
      return false;
    }
    if (isTransientSandboxConnectNode(current)) {
      hasTransient = true;
    }
  }
  return hasTransient;
}

/**
 * 判断底层异常是否代表远端容器丢失或连接中断，适合触发慢路径自愈探测并重试一次。
 */
export function isRecoverableSandboxError(error: unknown): boolean {
  let matched = false;
  for (const current of iterCauseChain(error)) {
    if (isFileNotFoundException(current)) {
      return false;
    }
    if (isConfirmedSandboxUnavailableNode(current) || isTransientSandboxConnectNode(current)) {
      matched = true;
    }
  }
  return matched;
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

  for (const current of iterCauseChain(error.cause)) {
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

    if (isTransientTransportError(current)) {
      return true;
    }
  }

  return false;
}
