import type { Command } from 'commander';
import { ZodError } from 'zod';
import {
  assertAuthAllowed,
  resolveEffectiveAuth,
  type ResolvedAuthContext
} from '../domain/auth/auth-resolver';
import { createOutputRenderer } from '../infra/ui/renderer';
import { CliArgumentError } from '../shared/errors';
import type {
  CliAuthModeRequirement,
  CliFormat,
  CliResult,
  CliRiskLevel,
  CommandMeta,
  CommandOptionMeta,
  CommandPositionalMeta,
  GlobalCliOptions
} from '../shared/types';
import type { CliContainer } from './container';

export type CommandExecutionContext = {
  readonly global: GlobalCliOptions;
  readonly options: Record<string, unknown>;
  readonly positional: readonly string[];
  readonly resolvedAuth?: ResolvedAuthContext;
  readonly container: CliContainer;
  readonly commandMetas: readonly CommandMeta[];
};

export type CliCommandSpec = {
  readonly path: readonly string[];
  readonly aliases?: readonly string[];
  readonly summary: string;
  readonly risk: CliRiskLevel;
  readonly authModes: readonly CliAuthModeRequirement[];
  readonly positionalArgs?: readonly CommandPositionalMeta[];
  readonly options: readonly CommandOptionMeta[];
  readonly examples?: readonly { description: string; args: readonly string[] }[];
  readonly configure?: (command: Command) => void;
  readonly execute: (ctx: CommandExecutionContext) => Promise<CliResult>;
};

export function extractGlobalOptions({
  raw,
  defaultFormat,
  defaultColor
}: {
  raw: Record<string, unknown>;
  defaultFormat: CliFormat;
  defaultColor: boolean;
}): GlobalCliOptions {
  const rawFormat = raw.format;
  if (rawFormat !== undefined && rawFormat !== 'text' && rawFormat !== 'json') {
    throw new CliArgumentError('--format must be "text" or "json".');
  }

  return {
    profile: typeof raw.profile === 'string' ? raw.profile : undefined,
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : undefined,
    token: typeof raw.token === 'string' ? raw.token : undefined,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : undefined,
    allowInsecureHttp: raw.allowInsecureHttp === true,
    insecure: raw.insecure === true,
    caCert: typeof raw.caCert === 'string' ? raw.caCert : undefined,
    format: rawFormat ?? defaultFormat,
    quiet: raw.quiet === true,
    color: defaultColor && raw.color !== false
  };
}

/**
 * 统一命令执行中间件管线：
 * 1. 提取并校验全局选项；
 * 2. 若命令要求鉴权，先本地执行凭据解析与 `authModes` 门禁检查；
 * 3. 调用命令执行体并交由渲染器输出至 stdout。
 */
export async function executeCommandWithPipeline({
  spec,
  rawOptions,
  positional,
  defaultFormat,
  defaultColor,
  container,
  commandMetas,
  stdout
}: {
  spec: CliCommandSpec;
  rawOptions: Record<string, unknown>;
  positional: readonly string[];
  defaultFormat: CliFormat;
  defaultColor: boolean;
  container: CliContainer;
  commandMetas: readonly CommandMeta[];
  stdout: (value: string) => void;
}): Promise<void> {
  const global = extractGlobalOptions({ raw: rawOptions, defaultFormat, defaultColor });
  const commandName = spec.path.join(' ');

  let resolvedAuth: ResolvedAuthContext | undefined;
  if (!spec.authModes.includes('none')) {
    resolvedAuth = await resolveEffectiveAuth({
      options: global,
      env: container.env,
      configRepo: container.configRepo,
      secretStore: container.secretStore
    });
    assertAuthAllowed({
      resolved: resolvedAuth,
      authModes: spec.authModes,
      commandName
    });
  }

  let result: CliResult;
  try {
    result = await spec.execute({
      global,
      options: rawOptions,
      positional,
      resolvedAuth,
      container,
      commandMetas
    });
  } catch (error) {
    if (error instanceof ZodError) {
      throw new CliArgumentError(`Invalid options for "${commandName}".`, {
        issues: error.issues
      });
    }
    throw error;
  }

  const renderer = createOutputRenderer({
    format: global.format,
    color: global.color
  });
  stdout(renderer.renderSuccess({ command: commandName, result, quiet: global.quiet }));
}
