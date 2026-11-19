import { redactSecrets } from './errors';
import type {
  ErrorHookContext,
  FastGptHooks,
  FastGptLogLevel,
  FastGptLogger,
  RequestHookContext,
  ResponseHookContext
} from './types';

const SENSITIVE_HEADER_NAMES = new Set<string>([
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'cookie',
  'set-cookie'
]);

const LOG_LEVEL_WEIGHT: Record<FastGptLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 99
};

/**
 * 对请求头中的鉴权与会话字段执行脱敏，确保钩子与日志不泄漏明文凭证。
 */
export const redactHeaders = (headers: Record<string, string>): Record<string, string> => {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_HEADER_NAMES.has(lower)) {
      const redacted = redactSecrets(value);
      sanitized[key] = redacted === value ? '****' : redacted;
    } else {
      sanitized[key] = redactSecrets(value);
    }
  }
  return sanitized;
};

/**
 * 将用户传入的日志级别或自定义日志器归一化为统一接口；未开启时返回 null。
 */
export const resolveLogger = (logger?: FastGptLogger | FastGptLogLevel): FastGptLogger | null => {
  if (logger === undefined || logger === 'silent') {
    return null;
  }
  if (typeof logger !== 'string') {
    return logger;
  }

  const minWeight = LOG_LEVEL_WEIGHT[logger];
  return {
    debug: (message, meta) => {
      if (LOG_LEVEL_WEIGHT.debug >= minWeight) {
        console.debug(`[fastgpt-sdk] ${message}`, meta ?? {});
      }
    },
    info: (message, meta) => {
      if (LOG_LEVEL_WEIGHT.info >= minWeight) {
        console.info(`[fastgpt-sdk] ${message}`, meta ?? {});
      }
    },
    warn: (message, meta) => {
      if (LOG_LEVEL_WEIGHT.warn >= minWeight) {
        console.warn(`[fastgpt-sdk] ${message}`, meta ?? {});
      }
    },
    error: (message, meta) => {
      if (LOG_LEVEL_WEIGHT.error >= minWeight) {
        console.error(`[fastgpt-sdk] ${message}`, meta ?? {});
      }
    }
  };
};

const invokeSafely = async <T>({
  hook,
  context,
  logger,
  hookName
}: {
  hook?: (ctx: T) => void | Promise<void>;
  context: T;
  logger: FastGptLogger | null;
  hookName: string;
}): Promise<void> => {
  if (hook === undefined) return;
  try {
    await hook(context);
  } catch (hookError) {
    logger?.warn?.(`FastGPT SDK ${hookName} hook threw an error`, {
      error: hookError instanceof Error ? hookError.message : String(hookError)
    });
  }
};

/**
 * 在发起 HTTP 请求前记录脱敏日志并触发 onRequest 钩子。
 */
export const notifyRequestObservability = async ({
  hooks,
  logger,
  context
}: {
  hooks?: FastGptHooks;
  logger: FastGptLogger | null;
  context: RequestHookContext;
}): Promise<void> => {
  const sanitizedContext: RequestHookContext = {
    ...context,
    url: redactSecrets(context.url),
    headers: redactHeaders(context.headers)
  };

  logger?.debug?.(`${sanitizedContext.method} ${sanitizedContext.url}`, {
    operationId: sanitizedContext.operationId,
    attempt: sanitizedContext.attempt,
    headers: sanitizedContext.headers
  });

  await invokeSafely({
    hook: hooks?.onRequest,
    context: sanitizedContext,
    logger,
    hookName: 'onRequest'
  });
};

/**
 * 在收到 HTTP 响应后记录脱敏日志并触发 onResponse 钩子。
 */
export const notifyResponseObservability = async ({
  hooks,
  logger,
  context
}: {
  hooks?: FastGptHooks;
  logger: FastGptLogger | null;
  context: ResponseHookContext;
}): Promise<void> => {
  const sanitizedContext: ResponseHookContext = {
    ...context,
    url: redactSecrets(context.url)
  };

  logger?.debug?.(
    `${sanitizedContext.method} ${sanitizedContext.url} -> ${sanitizedContext.status} (${sanitizedContext.durationMs}ms)`,
    {
      operationId: sanitizedContext.operationId,
      status: sanitizedContext.status,
      requestId: sanitizedContext.requestId,
      durationMs: sanitizedContext.durationMs,
      attempt: sanitizedContext.attempt
    }
  );

  await invokeSafely({
    hook: hooks?.onResponse,
    context: sanitizedContext,
    logger,
    hookName: 'onResponse'
  });
};

/**
 * 在请求发生业务错误、网络错误或超时时记录脱敏日志并触发 onError 钩子。
 */
export const notifyErrorObservability = async ({
  hooks,
  logger,
  context
}: {
  hooks?: FastGptHooks;
  logger: FastGptLogger | null;
  context: ErrorHookContext;
}): Promise<void> => {
  const sanitizedContext: ErrorHookContext = {
    ...context,
    url: redactSecrets(context.url)
  };

  logger?.error?.(`${sanitizedContext.method} ${sanitizedContext.url} failed`, {
    operationId: sanitizedContext.operationId,
    durationMs: sanitizedContext.durationMs,
    attempt: sanitizedContext.attempt,
    errorName: sanitizedContext.error.name,
    errorMessage: redactSecrets(sanitizedContext.error.message)
  });

  await invokeSafely({
    hook: hooks?.onError,
    context: sanitizedContext,
    logger,
    hookName: 'onError'
  });
};
