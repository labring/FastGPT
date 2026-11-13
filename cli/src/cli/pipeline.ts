import type { Command } from 'commander';
import { ZodError, type z } from 'zod';
import {
  assertAuthAllowed,
  resolveEffectiveAuth,
  type ResolvedAuthContext
} from '../domain/auth/auth-resolver';
import type { FastGptHttpClient } from '../infra/http/fastgpt-http-client';
import { createOutputRenderer } from '../infra/ui/renderer';
import { CliArgumentError } from '../shared/errors';
import { parseIdListOption } from '../shared/input';
import { applyFieldsProjection } from '../shared/output-transform';
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

export type CliLogger = {
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

export type CommandExecutionContext = {
  readonly global: GlobalCliOptions;
  readonly options: Record<string, unknown>;
  readonly positional: readonly string[];
  readonly resolvedAuth?: ResolvedAuthContext;
  readonly container: CliContainer;
  readonly commandMetas: readonly CommandMeta[];
  readonly logger: CliLogger;
  readonly client?: FastGptHttpClient;
};

export type CliCommandSpec = {
  readonly path: readonly string[];
  readonly aliases?: readonly string[];
  readonly summary: string;
  readonly risk: CliRiskLevel;
  readonly authModes: readonly CliAuthModeRequirement[];
  readonly positionalArgs?: readonly CommandPositionalMeta[];
  readonly options: readonly CommandOptionMeta[];
  readonly inputSchema?: z.ZodTypeAny;
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
    color: defaultColor && raw.color !== false,
    fields: parseIdListOption(raw.fields),
    pick: typeof raw.pick === 'string' && raw.pick.trim().length > 0 ? raw.pick.trim() : undefined,
    raw: raw.raw === true
  };
}

function formatZodValidationError(commandName: string, error: ZodError): CliArgumentError {
  const summaryIssues = error.issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'input';
      return `${path}: ${issue.message}`;
    })
    .join('; ');

  return new CliArgumentError(
    `Invalid options for "${commandName}": ${summaryIssues}`,
    { issues: error.issues },
    `Run "fastgpt commands --command \\"${commandName}\\" --format json" to inspect valid parameters.`
  );
}

/**
 * 构造与当前认证上下文绑定的 HTTP Client，自动注入 Base URL 与认证头。
 */
function createBoundHttpClient({
  container,
  global,
  resolvedAuth
}: {
  container: CliContainer;
  global: GlobalCliOptions;
  resolvedAuth?: ResolvedAuthContext;
}): FastGptHttpClient | undefined {
  if (!resolvedAuth || !resolvedAuth.credential) {
    return undefined;
  }

  const baseClient = container.createHttpClient({
    baseUrl: resolvedAuth.baseUrl,
    insecure: global.insecure,
    caCertPath: global.caCert
  });

  const authPayload = {
    authType: resolvedAuth.credential.authType,
    secret: resolvedAuth.credential.secret
  };

  return {
    baseUrl: baseClient.baseUrl,
    request: (params) => baseClient.request({ auth: authPayload, ...params }),
    requestRaw: (params) => baseClient.requestRaw({ auth: authPayload, ...params }),
    putExternal: baseClient.putExternal,
    uploadMultipart: (params) => baseClient.uploadMultipart({ auth: authPayload, ...params }),
    streamSse: (params) => baseClient.streamSse({ auth: authPayload, ...params })
  };
}

/**
 * 统一命令执行中间件管线：
 * 1. 提取并校验全局选项；
 * 2. 鉴权门禁中间件：解析凭据并在本地执行 authModes 检查；
 * 3. 破坏性操作确认门禁：非 TTY 或 --format json 下强制校验 --yes；
 * 4. 自动绑定上下文 HTTP 客户端与结构化 Logger；
 * 5. 执行命令并在 meta 自动注入耗时 durationMs，最后交由渲染器输出。
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
  const startTime = Date.now();
  const global = extractGlobalOptions({ raw: rawOptions, defaultFormat, defaultColor });
  const commandName = spec.path.join(' ');

  const logger: CliLogger = {
    debug: (msg) => {
      if (!global.quiet && (container.env.DEBUG || container.env.FASTGPT_DEBUG)) {
        container.stderr(`[DEBUG] ${msg}`);
      }
    },
    info: (msg) => {
      if (!global.quiet) {
        container.stderr(msg);
      }
    },
    warn: (msg) => {
      if (!global.quiet) {
        container.stderr(`Warning: ${msg}`);
      }
    },
    error: (msg) => {
      if (!global.quiet) {
        container.stderr(`Error: ${msg}`);
      }
    }
  };

  const resolvedAuth: ResolvedAuthContext | undefined = await (async () => {
    if (spec.authModes.includes('none')) {
      return undefined;
    }
    const resolved = await resolveEffectiveAuth({
      options: global,
      env: container.env,
      configRepo: container.configRepo,
      secretStore: container.secretStore
    });
    assertAuthAllowed({
      resolved,
      authModes: spec.authModes,
      commandName
    });
    return resolved;
  })();

  // 破坏性操作安全中间件：在非交互环境（如脚本、CI、--format json）未显式传 --yes 时阻断执行
  if (spec.risk === 'destructive' && rawOptions.dryRun !== true) {
    const isNonInteractive = !container.prompter.isInteractive || global.format === 'json';
    if (isNonInteractive && rawOptions.yes !== true) {
      throw new CliArgumentError(
        `Destructive command "${commandName}" requires explicit confirmation in non-interactive / JSON mode.`,
        undefined,
        'Pass --yes to confirm execution.'
      );
    }
  }

  const client = createBoundHttpClient({ container, global, resolvedAuth });

  const effectiveOptions = (() => {
    if (!spec.inputSchema) {
      return rawOptions;
    }
    try {
      return spec.inputSchema.parse(rawOptions) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof ZodError) {
        throw formatZodValidationError(commandName, error);
      }
      throw error;
    }
  })();

  let result: CliResult;
  try {
    result = await spec.execute({
      global,
      options: effectiveOptions,
      positional,
      resolvedAuth,
      container,
      commandMetas,
      logger,
      client
    });
  } catch (error) {
    if (error instanceof ZodError) {
      throw formatZodValidationError(commandName, error);
    }
    throw error;
  }

  // 自动在 meta 注入执行耗时，在 dry-run 补充 risk 等级，并应用 --fields 白名单投影
  const durationMs = Date.now() - startTime;
  const enrichedData = (() => {
    const withRisk = (() => {
      if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
        return result.data;
      }
      const dataObj = result.data as Record<string, unknown>;
      if (dataObj.dryRun === true && dataObj.risk === undefined) {
        return {
          risk: spec.risk,
          ...dataObj
        };
      }
      return result.data;
    })();

    if (global.fields && global.fields.length > 0) {
      return applyFieldsProjection({ data: withRisk, fields: global.fields });
    }
    return withRisk;
  })();

  const enrichedResult: CliResult = {
    ...result,
    data: enrichedData,
    meta: {
      durationMs,
      ...(result.meta ?? {})
    }
  };

  const renderer = createOutputRenderer({
    format: global.format,
    color: global.color
  });
  stdout(
    renderer.renderSuccess({
      command: commandName,
      result: enrichedResult,
      quiet: global.quiet,
      pick: global.pick,
      raw: global.raw
    })
  );
}
