import picocolors from 'picocolors';
import { CliError } from '../../shared/errors';
import { pickDotPath } from '../../shared/output-transform';
import { redactText, redactValue } from '../../shared/redact';
import type { CliFormat, CliResult } from '../../shared/types';

export const CLI_OUTPUT_SCHEMA_VERSION = 'fastgpt-cli-result/v1' as const;

export type CliSuccessEnvelope = {
  schemaVersion: typeof CLI_OUTPUT_SCHEMA_VERSION;
  ok: true;
  command: string;
  changed: boolean;
  data?: unknown;
  meta?: Record<string, unknown>;
  warnings?: string[];
};

export type CliErrorEnvelope = {
  schemaVersion: typeof CLI_OUTPUT_SCHEMA_VERSION;
  ok: false;
  command: string;
  changed: false;
  error: {
    code: string;
    message: string;
    hint?: string;
    details?: Record<string, unknown>;
  };
};

export type OutputRenderer = {
  renderSuccess: (params: {
    command: string;
    result: CliResult;
    quiet?: boolean;
    pick?: string;
    raw?: boolean;
  }) => string;
  renderError: (params: { command: string; error: unknown }) => string;
};

/**
 * 构建带统一 schemaVersion 的成功响应结构，并强制执行敏感字段脱敏（无警告时省略空 warnings 数组以节省 Token）。
 */
export function createSuccessEnvelope(command: string, result: CliResult): CliSuccessEnvelope {
  const safeWarnings = (result.warnings ?? []).map((item) => redactText(item));
  return {
    schemaVersion: CLI_OUTPUT_SCHEMA_VERSION,
    ok: true,
    command: redactText(command),
    changed: result.changed,
    ...(result.data !== undefined ? { data: redactValue(result.data) } : {}),
    ...(result.meta !== undefined ? { meta: redactValue(result.meta) } : {}),
    ...(safeWarnings.length > 0 ? { warnings: safeWarnings } : {})
  };
}

export function normalizeCliError(error: unknown): {
  code: string;
  message: string;
  hint?: string;
  details?: Record<string, unknown>;
} {
  if (error instanceof CliError) {
    return {
      code: error.code,
      message: redactText(error.message),
      ...(error.hint ? { hint: redactText(error.hint) } : {}),
      ...(error.details ? { details: redactValue(error.details) } : {})
    };
  }
  return {
    code: 'CLI_INTERNAL_ERROR',
    message: redactText(error instanceof Error ? error.message : String(error))
  };
}

/**
 * JSON 输出渲染策略：服务于 Agent、CI 与管道消费。
 */
export function createJsonRenderer(): OutputRenderer {
  return {
    renderSuccess: ({ command, result, pick, raw }) => {
      const envelope = createSuccessEnvelope(command, result);
      if (pick) {
        const picked = pickDotPath({
          envelope: envelope as unknown as Record<string, unknown>,
          path: pick
        });
        if (raw) {
          return typeof picked === 'string' ? picked : JSON.stringify(picked);
        }
        return JSON.stringify({
          ...envelope,
          data: picked
        });
      }
      if (raw) {
        const payload = envelope.data !== undefined ? envelope.data : envelope;
        return typeof payload === 'string' ? payload : JSON.stringify(payload);
      }
      return JSON.stringify(envelope);
    },
    renderError: ({ command, error }) => {
      const envelope: CliErrorEnvelope = {
        schemaVersion: CLI_OUTPUT_SCHEMA_VERSION,
        ok: false,
        command: redactText(command),
        changed: false,
        error: normalizeCliError(error)
      };
      return JSON.stringify(envelope);
    }
  };
}

/**
 * 终端文本渲染策略：使用 `picocolors` 增强人类可读性，`noColor` 时自动降级纯文本。
 */
export function createTextRenderer({ color }: { color: boolean }): OutputRenderer {
  const pc = picocolors.createColors(color);

  function formatRecordLines(record: Record<string, unknown>, indent = ''): string[] {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(record)) {
      if (value === undefined) {
        continue;
      }

      const coloredKey = pc.cyan(key);
      if (Array.isArray(value)) {
        if (value.length === 0) {
          lines.push(`${indent}${coloredKey}: ${pc.dim('(none)')}`);
          continue;
        }
        const allPrimitive = value.every((item) => item === null || typeof item !== 'object');
        if (allPrimitive) {
          lines.push(`${indent}${coloredKey}: ${value.map((item) => String(item)).join(', ')}`);
        } else {
          lines.push(`${indent}${coloredKey}:`);
          value.forEach((item, index) => {
            if (item !== null && typeof item === 'object') {
              lines.push(`${indent}  ${pc.dim(`- [${index}]`)}`);
              lines.push(...formatRecordLines(item as Record<string, unknown>, `${indent}    `));
            } else {
              lines.push(`${indent}  - ${String(item)}`);
            }
          });
        }
        continue;
      }

      if (value !== null && typeof value === 'object') {
        lines.push(`${indent}${coloredKey}:`);
        lines.push(...formatRecordLines(value as Record<string, unknown>, `${indent}  `));
        continue;
      }

      lines.push(`${indent}${coloredKey}: ${value === null ? pc.dim('null') : String(value)}`);
    }
    return lines;
  }

  return {
    renderSuccess: ({ command, result, quiet = false, pick, raw }) => {
      if (pick) {
        const envelope = createSuccessEnvelope(command, result);
        const picked = pickDotPath({
          envelope: envelope as unknown as Record<string, unknown>,
          path: pick
        });
        if (raw || typeof picked !== 'object' || picked === null) {
          return typeof picked === 'string' ? picked : JSON.stringify(picked);
        }
        return JSON.stringify(picked, null, 2);
      }

      if (raw) {
        const safeData = result.data !== undefined ? redactValue(result.data) : undefined;
        if (safeData === undefined) {
          return '';
        }
        return typeof safeData === 'string' ? safeData : JSON.stringify(safeData);
      }

      const lines: string[] = [];
      if (!quiet && result.message) {
        lines.push(pc.green(redactText(result.message)));
      }

      if (result.data !== undefined) {
        const safeData = redactValue(result.data);
        if (typeof safeData === 'string') {
          lines.push(safeData);
        } else if (safeData !== null && typeof safeData === 'object' && !Array.isArray(safeData)) {
          lines.push(...formatRecordLines(safeData as Record<string, unknown>));
        } else {
          lines.push(JSON.stringify(safeData, null, 2));
        }
      }

      if (!quiet && result.warnings && result.warnings.length > 0) {
        for (const warning of result.warnings) {
          lines.push(pc.yellow(`Warning: ${redactText(warning)}`));
        }
      }

      return lines.join('\n') || pc.green('OK');
    },
    renderError: ({ error }) => {
      const normalized = normalizeCliError(error);
      const parts = [pc.red(`Error [${normalized.code}]: ${normalized.message}`)];
      if (normalized.hint) {
        parts.push(pc.dim(`Hint: ${normalized.hint}`));
      }
      return parts.join('\n');
    }
  };
}

/**
 * 渲染器工厂：根据输出格式选择对应渲染策略。
 */
export function createOutputRenderer({
  format,
  color
}: {
  format: CliFormat;
  color: boolean;
}): OutputRenderer {
  if (format === 'json') {
    return createJsonRenderer();
  }
  return createTextRenderer({ color });
}
