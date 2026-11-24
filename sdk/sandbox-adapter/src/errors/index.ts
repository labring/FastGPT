export type SandboxErrorCode =
  | 'INTERNAL_UNKNOWN_ERROR'
  | 'CONNECTION_ERROR'
  | 'TIMEOUT'
  | 'READY_TIMEOUT'
  | 'UNHEALTHY'
  | 'INVALID_ARGUMENT'
  | 'UNEXPECTED_RESPONSE'
  | 'FEATURE_NOT_SUPPORTED'
  | 'SANDBOX_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'FILE_NOT_FOUND'
  | 'FILE_ALREADY_EXISTS'
  | 'COMMAND_FAILED'
  | (string & {});

/** Base error for every adapter failure exposed to consumers. */
export class SandboxException extends Error {
  constructor(
    message: string,
    public readonly code: SandboxErrorCode = 'INTERNAL_UNKNOWN_ERROR',
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = 'SandboxException';
    Object.setPrototypeOf(this, SandboxException.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      cause: this.cause,
      stack: this.stack
    };
  }
}

export class ConnectionError extends SandboxException {
  constructor(
    message: string,
    public readonly endpoint?: string,
    cause?: unknown
  ) {
    super(message, 'CONNECTION_ERROR', cause);
    this.name = 'ConnectionError';
    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}

/**
 * 远端已明确终止的结构化证据（容器非 0 退出、Pod 失败、配额拒绝等）。
 *
 * provider 的终止原因常被外层 `ConnectionError` 包在 `cause` 里，只读 message
 * 会丢失证据。该异常把终止码与原始详情显式带到适配器边界之外，下游可沿 cause
 * 链读取，用于判定“结果已确定”而不是“结果未知”。
 *
 * `code`/`detail` 是稳定的结构化字段；对外 `message` 默认使用可直接展示的
 * `displayMessage`（provider 原始原因），不再退化成 `Failed to create sandbox` 这类
 * 通用包装文案。
 */
export class SandboxTerminationError extends SandboxException {
  constructor(
    code: string,
    public readonly detail?: string,
    options?: { message?: string; cause?: unknown }
  ) {
    super(options?.message ?? detail ?? `Sandbox terminated: ${code}`, code, options?.cause);
    this.name = 'SandboxTerminationError';
    Object.setPrototypeOf(this, SandboxTerminationError.prototype);
  }
}

/**
 * provider 边界的沙箱失败契约（唯一真源）。
 *
 * - `code`：provider 原始码，例如 `KUBERNETES::POD_FAILED`；
 * - `terminated`：远端是否已明确结束（只有终止码表命中才为 true）；
 * - `displayMessage`：可直接展示的单行原因，来自 provider message，已去控制字符/换行。
 */
export type SandboxFailureDetail = {
  code: string;
  terminated: boolean;
  displayMessage: string;
};

/**
 * provider 原始终止码表。
 *
 * 这是全局唯一一份终止码表：两个 provider（opensandbox / sealos-devbox）与 service / app
 * 都只能消费 `getSandboxFailureDetail` 的结果，不得再维护文本特征或复制本表。超时
 * （如 `KUBERNETES::POD_READY_TIMEOUT`）和网络错误不在表中，必须按“结果未知”处理。
 *
 * - `KUBERNETES::*`：opensandbox 的 Kubernetes 结构化状态码；
 * - `SEALOS_DEVBOX::FAILED`：sealos-devbox 的 info `state.phase === "Error"`，
 *   Devbox controller 已把实例判为不可自愈的终态；
 * - `SEALOS_DEVBOX::CREATE_REJECTED`：sealos-devbox 的 create API 以 400/402/403/409/422
 *   明确拒绝创建（Pod 准入被拒、配额不足、参数校验失败、重名冲突），远端没有产生可继续
 *   使用的实例；401/408/429/5xx 仍按“结果未知”处理。
 *
 * sealos-devbox 的 Paused/Stopped/Shutdown/Pausing/Stopping/Shutting、Unknown 阶段、
 * 命令执行失败、超时和网络错误都不是终止码。
 */
export const SANDBOX_TERMINAL_CODES: readonly string[] = [
  'KUBERNETES::POD_FAILED',
  'KUBERNETES::QUOTA_EXCEEDED',
  'SEALOS_DEVBOX::FAILED',
  'SEALOS_DEVBOX::CREATE_REJECTED'
];

/** 适配器自身/传输层错误码，不代表 provider 终止原因，选码时排在 provider 码之后。 */
const TRANSPORT_ERROR_CODES: ReadonlySet<string> = new Set([
  'INTERNAL_UNKNOWN_ERROR',
  'CONNECTION_ERROR',
  'TIMEOUT',
  'READY_TIMEOUT',
  'UNHEALTHY',
  'INVALID_ARGUMENT',
  'UNEXPECTED_RESPONSE',
  'FEATURE_NOT_SUPPORTED',
  'SANDBOX_NOT_FOUND',
  'PERMISSION_DENIED',
  'FILE_NOT_FOUND',
  'FILE_ALREADY_EXISTS',
  'COMMAND_FAILED',
  'INVALID_STATE'
]);

const MAX_DISPLAY_MESSAGE_LENGTH = 500;

/** 通用包装文案没有诊断价值，只有在没有更具体原因时才兜底展示。 */
const GENERIC_FAILURE_MESSAGES: ReadonlySet<string> = new Set([
  'Failed to create sandbox',
  'Sandbox create failed',
  'Sandbox error',
  'unknown error',
  'Unknown error'
]);

/** 把 provider message 收敛成可直接展示的单行文本：去控制字符/换行、脱敏、限长。 */
const sanitizeDisplayMessage = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const text = value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***')
    .replace(/\b(api[_-]?key|token|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=***')
    .trim();
  if (!text) return undefined;
  return text.length > MAX_DISPLAY_MESSAGE_LENGTH
    ? `${text.slice(0, MAX_DISPLAY_MESSAGE_LENGTH - 1)}…`
    : text;
};

type FailureEvidence = { codes: string[]; texts: string[] };

const MAX_FAILURE_EVIDENCE_DEPTH = 8;

/**
 * 沿 cause/AggregateError/opensandbox `error` 字段收集结构化 code 与原始文案。
 *
 * 只从结构化字段读 code（`code`/`reason`），绝不从 message 文本反推码；message 仅作为
 * `displayMessage` 的候选来源。
 *
 * `seen` 与遍历深度属于同一轮遍历，收进闭包；对外只接收待检查的 error。
 */
const collectFailureEvidence = (value: unknown): FailureEvidence => {
  const evidence: FailureEvidence = { codes: [], texts: [] };
  const seen = new Set<unknown>();

  const visit = (current: unknown, depth: number): void => {
    if (depth > MAX_FAILURE_EVIDENCE_DEPTH || current === null || current === undefined) return;
    if (typeof current === 'string') {
      evidence.texts.push(current);
      return;
    }
    if (typeof current !== 'object' || seen.has(current)) return;
    seen.add(current);

    const record = current as Record<string, unknown>;
    if (typeof record.code === 'string') evidence.codes.push(record.code);
    // provider status 的 reason 是 machine-readable code；不是终止码时自然会被判为未知。
    if (typeof record.reason === 'string') evidence.codes.push(record.reason);
    for (const key of ['detail', 'errorText', 'system_error_text']) {
      if (typeof record[key] === 'string') evidence.texts.push(record[key] as string);
    }

    // provider 的结构化 payload 优先于外层包装文案。
    visit(record.error, depth + 1);
    visit(record.status, depth + 1);
    if (Array.isArray(record.errors)) {
      for (const nested of record.errors) visit(nested, depth + 1);
    }
    visit(record.cause, depth + 1);
    if (typeof record.message === 'string') evidence.texts.push(record.message);
  };

  visit(value, 0);
  return evidence;
};

/**
 * 终止码优先，其次是 provider 命名空间码，最后才是非传输层码。
 *
 * 只有传输层/适配器码时返回 undefined：包装层不能伪装成 provider 结构化证据。
 */
const pickFailureCode = (codes: string[]): string | undefined => {
  const terminal = codes.find((code) => SANDBOX_TERMINAL_CODES.includes(code));
  if (terminal) return terminal;
  return (
    codes.find((code) => code.includes('::') && !TRANSPORT_ERROR_CODES.has(code)) ??
    codes.find((code) => !TRANSPORT_ERROR_CODES.has(code))
  );
};

/** 选取最具体的 provider 文案，并确保展示原因里保留结构化 code。 */
const pickDisplayMessage = (texts: string[], code: string): string => {
  const normalized = [
    ...new Set(texts.map((text) => sanitizeDisplayMessage(text)).filter(Boolean))
  ] as string[];
  const specific = normalized.find(
    (text) =>
      !GENERIC_FAILURE_MESSAGES.has(text) &&
      (text.includes(code) ||
        text.includes('ContainerFailed') ||
        text.includes('InitContainerFailed') ||
        text.includes('exited with code'))
  );
  const chosen = specific ?? normalized.find((text) => !GENERIC_FAILURE_MESSAGES.has(text));
  if (!chosen) return code;
  return chosen.includes(code) ? chosen : `${code}: ${chosen}`;
};

/**
 * 读取沙箱失败的结构化契约。
 *
 * 沿 cause 链读取 provider 原始 code 与 message；没有结构化 code 时返回 undefined，
 * 表示“未知结果”，调用方必须保留隔离窗口而不是猜测终止。
 */
export const getSandboxFailureDetail = (error: unknown): SandboxFailureDetail | undefined => {
  if (error === null || error === undefined) return undefined;

  const evidence = collectFailureEvidence(error);
  const code = pickFailureCode(evidence.codes);
  if (!code) return undefined;

  return {
    code,
    terminated: SANDBOX_TERMINAL_CODES.includes(code),
    displayMessage: pickDisplayMessage(evidence.texts, code)
  };
};

export class FeatureNotSupportedError extends SandboxException {
  constructor(
    message: string,
    public readonly feature: string,
    public readonly provider: string
  ) {
    super(`Feature not supported by ${provider}: ${message}`, 'FEATURE_NOT_SUPPORTED');
    this.name = 'FeatureNotSupportedError';
    Object.setPrototypeOf(this, FeatureNotSupportedError.prototype);
  }
}

export class SandboxNotFoundError extends SandboxException {
  constructor(message: string) {
    super(message, 'SANDBOX_NOT_FOUND');
    this.name = 'SandboxNotFoundError';
    Object.setPrototypeOf(this, SandboxNotFoundError.prototype);
  }
}

export class SandboxStateError extends SandboxException {
  constructor(
    message: string,
    public readonly currentState: string,
    public readonly requiredState?: string
  ) {
    super(
      `Invalid sandbox state: ${message} (current: ${currentState}${requiredState ? `, required: ${requiredState}` : ''})`,
      'INVALID_STATE'
    );
    this.name = 'SandboxStateError';
    Object.setPrototypeOf(this, SandboxStateError.prototype);
  }
}

/**
 * 只读连接入口的“可恢复不可用”判定。
 *
 * 三类结果都表示远端当前没有可继续使用的实例，生命周期可以按既有策略重建：
 * - `SandboxNotFoundError`：远端资源已不存在；
 * - `SandboxStateError`：远端处于非 Running 的已知阶段（暂停/停止等）；
 * - `SandboxTerminationError`：远端已明确终止（Pod 失败、配额拒绝等），
 *   结构化原因仍留在异常本身与 cause 链上供 `getSandboxFailureDetail` 读取。
 *
 * 网络抖动、超时、命令通道未就绪等 `ConnectionError` / `TimeoutError` 未知结果
 * **不**在判定范围内，调用方必须保持原策略（原样抛出、保留隔离窗口），不得触发重建。
 */
export const isRecoverableSandboxUnavailable = (error: unknown): boolean =>
  error instanceof SandboxNotFoundError ||
  error instanceof SandboxStateError ||
  error instanceof SandboxTerminationError;

export class TimeoutError extends SandboxException {
  constructor(
    message: string,
    public readonly timeoutMs: number,
    public readonly operation: string
  ) {
    super(message, 'TIMEOUT');
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

export class SandboxReadyTimeoutError extends SandboxException {
  constructor(sandboxId: string, timeoutMs: number) {
    super(`Sandbox ${sandboxId} did not become ready within ${timeoutMs}ms`, 'READY_TIMEOUT');
    this.name = 'SandboxReadyTimeoutError';
    Object.setPrototypeOf(this, SandboxReadyTimeoutError.prototype);
  }
}

export class CommandExecutionError extends SandboxException {
  readonly exitCode?: number;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly commandError?: Error;

  constructor(
    message: string,
    public readonly command: string,
    exitCodeOrCause?: number | Error,
    stdout?: string,
    stderr?: string
  ) {
    super(
      message,
      'COMMAND_FAILED',
      exitCodeOrCause instanceof Error ? exitCodeOrCause : undefined
    );
    this.name = 'CommandExecutionError';
    Object.setPrototypeOf(this, CommandExecutionError.prototype);

    if (exitCodeOrCause instanceof Error) this.commandError = exitCodeOrCause;
    else {
      this.exitCode = exitCodeOrCause;
      this.stdout = stdout;
      this.stderr = stderr;
    }
  }

  getCombinedOutput(): string {
    const output = this.stdout ?? '';
    if (!this.stderr) return output;
    return output ? `${output}\n${this.stderr}` : this.stderr;
  }
}

export type FileErrorCode =
  | 'FILE_NOT_FOUND'
  | 'FILE_ALREADY_EXISTS'
  | 'PERMISSION_DENIED'
  | 'PATH_IS_DIRECTORY'
  | 'PATH_NOT_DIRECTORY'
  | 'INVALID_PATH'
  | 'QUOTA_EXCEEDED'
  | 'TRANSFER_ERROR';

export class FileOperationError extends SandboxException {
  constructor(
    message: string,
    public readonly path: string,
    public readonly fileErrorCode: FileErrorCode,
    cause?: unknown
  ) {
    super(message, fileErrorCode, cause);
    this.name = 'FileOperationError';
    Object.setPrototypeOf(this, FileOperationError.prototype);
  }
}
