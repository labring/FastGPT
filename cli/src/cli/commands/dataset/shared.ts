import type { FastGptHttpClient } from '../../../infra/http/fastgpt-http-client';
import { CliArgumentError } from '../../../shared/errors';
import type { CommandExecutionContext } from '../../pipeline';

export function requireActiveClient(
  client: FastGptHttpClient | undefined,
  commandName: string
): FastGptHttpClient {
  if (!client) {
    throw new CliArgumentError(`Active HTTP client required for ${commandName}.`);
  }
  return client;
}

export function resolveIdArg({
  positional,
  flagValue,
  label,
  usage
}: {
  positional?: string;
  flagValue?: unknown;
  label: string;
  usage: string;
}): string {
  const value = positional ?? (typeof flagValue === 'string' ? flagValue : '');
  const trimmed = value.trim();
  if (!trimmed) {
    throw new CliArgumentError(`${label} is required.`, undefined, `Usage: ${usage}`);
  }
  return trimmed;
}

export async function confirmDestructiveAction({
  ctx,
  message
}: {
  ctx: CommandExecutionContext;
  message: string;
}): Promise<void> {
  if (
    ctx.options.dryRun !== true &&
    ctx.container.prompter.isInteractive &&
    ctx.global.format !== 'json' &&
    ctx.options.yes !== true
  ) {
    const confirmed = await ctx.container.prompter.confirm?.({ message });
    if (!confirmed) {
      throw new CliArgumentError('Operation cancelled by user.');
    }
  }
}

export function parseOptionalBooleanFlag({
  positive,
  negative
}: {
  positive?: unknown;
  negative?: unknown;
}): boolean | undefined {
  if (positive === true) return true;
  if (negative === true || positive === false) return false;
  return undefined;
}

export function parseOptionalNumber(raw: unknown): number | undefined {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new CliArgumentError(`Expected a numeric value but received "${raw}".`);
    }
    return parsed;
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      throw new CliArgumentError(`Expected a numeric value but received "${raw}".`);
    }
    return raw;
  }
  return undefined;
}
