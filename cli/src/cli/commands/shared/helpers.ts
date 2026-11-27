import type { FastGptHttpClient } from '../../../infra/http/fastgpt-http-client';
import { CliArgumentError } from '../../../shared/errors';
import { parseParentIdOption } from '../../../shared/input';
import type { CommandOptionMeta, CommandPositionalMeta } from '../../../shared/types';
import type { CommandExecutionContext } from '../../pipeline';

/**
 * 断言当前命令上下文存在已绑定鉴权的 HTTP 客户端。
 */
export function requireActiveClient(
  client: FastGptHttpClient | undefined,
  commandName: string
): FastGptHttpClient {
  if (!client) {
    throw new CliArgumentError(`Active HTTP client required for ${commandName}.`);
  }
  return client;
}

/**
 * 解析资源 ID 或目标参数（位置参数优先，其次 `--id` / 标志位），为空时抛出标准参数错误。
 */
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

/**
 * 交互模式下执行破坏性操作前向用户确认；`--dry-run`、`--yes`、非 TTY 或 `--format json` 跳过（非交互模式由 pipeline 门禁校验 `--yes`）。
 */
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

export function createIdPositionalArg(name: string, label: string): CommandPositionalMeta {
  return { name, required: false, description: `${label} ObjectId (or use --id)` };
}

export function createIdOption(argPlaceholder: string, label: string): CommandOptionMeta {
  return {
    name: 'id',
    flags: `--id <${argPlaceholder}>`,
    takesValue: true,
    description: `${label} ObjectId (alternative to positional argument)`
  };
}

export function createSearchOption(description: string): CommandOptionMeta {
  return { name: 'search', flags: '--search <keyword>', takesValue: true, description };
}

export function createParentIdOption(description: string): CommandOptionMeta {
  return { name: 'parentId', flags: '--parent-id <id>', takesValue: true, description };
}

export function createPaginationOptions(
  pageSizeDescription = 'Items per page (default 20)'
): CommandOptionMeta[] {
  return [
    {
      name: 'page',
      flags: '--page <n>',
      takesValue: true,
      description: 'Page number (default 1)'
    },
    {
      name: 'pageSize',
      flags: '--page-size <n>',
      takesValue: true,
      description: pageSizeDescription
    }
  ];
}

export function createJsonInputOptions(actionLabel: string): CommandOptionMeta[] {
  return [
    {
      name: 'file',
      flags: '--file <path>',
      takesValue: true,
      description: `Read ${actionLabel} JSON payload from file ("-" for stdin)`
    },
    {
      name: 'stdin',
      flags: '--stdin',
      takesValue: false,
      description: `Read ${actionLabel} JSON payload from stdin`
    }
  ];
}

export function createDryRunOption(
  description = 'Validate and preview changes without executing'
): CommandOptionMeta {
  return { name: 'dryRun', flags: '--dry-run', takesValue: false, description };
}

export function createYesOption(description = 'Confirm destructive deletion'): CommandOptionMeta {
  return { name: 'yes', flags: '--yes', takesValue: false, description };
}

/**
 * 按「显式 CLI 选项 > JSON 文件载荷」优先级提取字符串字段。
 */
export function resolveStringOption(
  options: Record<string, unknown>,
  filePayload: Record<string, unknown> | undefined,
  optionKey: string,
  payloadKey: string = optionKey
): string | undefined {
  if (typeof options[optionKey] === 'string') return options[optionKey];
  if (typeof filePayload?.[payloadKey] === 'string') return filePayload[payloadKey];
  return undefined;
}

/**
 * 按「显式 CLI 选项 > JSON 文件载荷」优先级提取通用 App 资源元信息（name/intro/avatar/parentId）。
 */
export function resolveCommonAppMetadata(
  options: Record<string, unknown>,
  filePayload?: Record<string, unknown>
): {
  name?: string;
  intro?: string;
  avatar?: string;
  parentId?: string | null;
} {
  return {
    name: resolveStringOption(options, filePayload, 'name'),
    intro: resolveStringOption(options, filePayload, 'intro'),
    avatar: resolveStringOption(options, filePayload, 'avatar'),
    parentId:
      options.parentId !== undefined
        ? parseParentIdOption(options.parentId)
        : filePayload?.parentId !== undefined
          ? parseParentIdOption(filePayload.parentId)
          : undefined
  };
}
