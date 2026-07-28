import type { CliAuditEvent, CliFormat, CliResult } from '../type';

export const CLI_OUTPUT_SCHEMA_VERSION = 'fastgpt-workflow-cli-result/v1' as const;

export type CliSuccessEnvelope = {
  schemaVersion: typeof CLI_OUTPUT_SCHEMA_VERSION;
  ok: true;
  command: string;
  changed: boolean;
  checksum?: string;
  result?: unknown;
  changes?: unknown[];
  warnings: unknown[];
  audit?: CliAuditEvent;
};

export type CliErrorEnvelope = {
  schemaVersion: typeof CLI_OUTPUT_SCHEMA_VERSION;
  ok: false;
  command: string;
  changed: false;
  errors: Array<{ code: string; diagnostics?: unknown; params?: unknown }>;
};

export const createSuccessEnvelope = (command: string, result: CliResult): CliSuccessEnvelope => ({
  schemaVersion: CLI_OUTPUT_SCHEMA_VERSION,
  ok: true,
  command,
  changed: result.changed,
  checksum: result.checksum,
  result: result.result,
  changes: result.changes,
  warnings: result.warnings ?? [],
  audit: result.audit
});

export const renderSuccess = ({
  command,
  result,
  format
}: {
  command: string;
  result: CliResult;
  format: CliFormat;
}) => {
  if (format === 'json') return JSON.stringify(createSuccessEnvelope(command, result));
  if (result.result !== undefined) {
    return typeof result.result === 'string'
      ? result.result
      : JSON.stringify(result.result, null, 2);
  }
  return result.message ?? 'OK';
};

export const renderError = ({
  command,
  code,
  diagnostics,
  params,
  format
}: {
  command: string;
  code: string;
  diagnostics?: unknown;
  params?: unknown;
  format: CliFormat;
}) => {
  const envelope: CliErrorEnvelope = {
    schemaVersion: CLI_OUTPUT_SCHEMA_VERSION,
    ok: false,
    command,
    changed: false,
    errors: [{ code, diagnostics, params }]
  };
  return format === 'json'
    ? JSON.stringify(envelope)
    : `${code}${diagnostics ? `\n${JSON.stringify(diagnostics, null, 2)}` : ''}`;
};
