import type { CliResult } from './types';

/**
 * 构造普通成功响应（无实体变更，如查询类命令）。
 */
export function createSuccessResult<T>(params: {
  data?: T;
  message?: string;
  warnings?: string[];
  meta?: Record<string, unknown>;
}): CliResult<T> {
  return {
    changed: false,
    ...(params.data !== undefined ? { data: params.data } : {}),
    ...(params.message !== undefined ? { message: params.message } : {}),
    ...(params.warnings !== undefined ? { warnings: params.warnings } : {}),
    ...(params.meta !== undefined ? { meta: params.meta } : {})
  };
}

/**
 * 构造变更成功响应（如增、删、改等写操作）。
 */
export function createChangedResult<T>(params: {
  data?: T;
  message?: string;
  warnings?: string[];
  meta?: Record<string, unknown>;
}): CliResult<T> {
  return {
    changed: true,
    ...(params.data !== undefined ? { data: params.data } : {}),
    ...(params.message !== undefined ? { message: params.message } : {}),
    ...(params.warnings !== undefined ? { warnings: params.warnings } : {}),
    ...(params.meta !== undefined ? { meta: params.meta } : {})
  };
}

/**
 * 构造 `--dry-run` 预览响应，统一将 changed 标记为 false 并携带结构化预览数据。
 */
export function createDryRunResult<T extends Record<string, unknown>>(params: {
  operation: string;
  preview: T;
  message?: string;
  warnings?: string[];
}): CliResult<T & { dryRun: true; operation: string }> {
  return {
    changed: false,
    message: params.message ?? `[DRY-RUN] Preview for operation "${params.operation}"`,
    data: {
      dryRun: true,
      operation: params.operation,
      ...params.preview
    },
    ...(params.warnings !== undefined ? { warnings: params.warnings } : {})
  };
}
