import { CliExitCode, type CliExitCodeValue } from './types';

export type CliErrorCode =
  | 'CLI_INTERNAL_ERROR'
  | 'CLI_ARGUMENT_INVALID'
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'AUTH_FORBIDDEN'
  | 'AUTH_EXPIRED'
  | 'AUTH_QUOTA_EXCEEDED'
  | 'AUTH_MODE_UNSUPPORTED'
  | 'AUTH_CONFLICT'
  | 'TLS_OR_URL_INVALID'
  | 'SERVER_CLI_UNSUPPORTED'
  | 'API_ERROR'
  | 'NETWORK_ERROR';

export class CliError extends Error {
  readonly exitCode: CliExitCodeValue;
  readonly code: CliErrorCode;
  readonly hint?: string;
  readonly details?: Record<string, unknown>;

  constructor({
    message,
    exitCode,
    code,
    hint,
    details
  }: {
    message: string;
    exitCode: CliExitCodeValue;
    code: CliErrorCode;
    hint?: string;
    details?: Record<string, unknown>;
  }) {
    super(message);
    this.name = new.target.name;
    this.exitCode = exitCode;
    this.code = code;
    this.hint = hint;
    this.details = details;
  }
}

export class CliArgumentError extends CliError {
  constructor(message: string, details?: Record<string, unknown>, hint?: string) {
    super({
      message,
      exitCode: CliExitCode.argument,
      code: 'CLI_ARGUMENT_INVALID',
      hint,
      details
    });
  }
}

export class CliAuthError extends CliError {
  constructor({
    message,
    code = 'AUTH_REQUIRED',
    hint,
    details
  }: {
    message: string;
    code?: Extract<
      CliErrorCode,
      | 'AUTH_REQUIRED'
      | 'AUTH_INVALID'
      | 'AUTH_FORBIDDEN'
      | 'AUTH_EXPIRED'
      | 'AUTH_QUOTA_EXCEEDED'
      | 'AUTH_MODE_UNSUPPORTED'
      | 'AUTH_CONFLICT'
      | 'TLS_OR_URL_INVALID'
    >;
    hint?: string;
    details?: Record<string, unknown>;
  }) {
    super({
      message,
      exitCode: CliExitCode.auth,
      code,
      hint,
      details
    });
  }
}

export class CliApiError extends CliError {
  readonly httpStatus?: number;
  readonly serverCode?: number;
  readonly statusText?: string;

  constructor({
    message,
    httpStatus,
    serverCode,
    statusText,
    hint,
    details,
    code = 'API_ERROR'
  }: {
    message: string;
    httpStatus?: number;
    serverCode?: number;
    statusText?: string;
    hint?: string;
    details?: Record<string, unknown>;
    code?: Extract<CliErrorCode, 'API_ERROR' | 'SERVER_CLI_UNSUPPORTED'>;
  }) {
    super({
      message,
      exitCode: CliExitCode.business,
      code,
      hint,
      details: {
        ...(httpStatus !== undefined ? { httpStatus } : {}),
        ...(serverCode !== undefined ? { serverCode } : {}),
        ...(statusText ? { statusText } : {}),
        ...details
      }
    });
    this.httpStatus = httpStatus;
    this.serverCode = serverCode;
    this.statusText = statusText;
  }
}

export class CliNetworkError extends CliError {
  constructor(message: string, hint?: string, details?: Record<string, unknown>) {
    super({
      message,
      exitCode: CliExitCode.network,
      code: 'NETWORK_ERROR',
      hint,
      details
    });
  }
}
