import {
  FastGptAuthError,
  FastGptBadRequestError,
  FastGptConflictError,
  FastGptError,
  FastGptNetworkError,
  FastGptNotFoundError,
  FastGptRateLimitError,
  FastGptServerError,
  FastGptTimeoutError,
  redactSecrets,
  type FastGptErrorDetails
} from './errors';
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
export const redactHeaders = (
  headers: Record<string, string>,
  extraSecrets?: ReadonlyArray<string>
): Record<string, string> => {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_HEADER_NAMES.has(lower)) {
      const redacted = redactSecrets(value, extraSecrets);
      sanitized[key] = redacted === value ? '****' : redacted;
    } else {
      sanitized[key] = redactSecrets(value, extraSecrets);
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

const MAX_CAUSE_DEPTH = 3;

const sanitizeCauseForHook = ({
  cause,
  depth,
  extraSecrets
}: {
  cause: unknown;
  depth: number;
  extraSecrets?: ReadonlyArray<string>;
}): unknown => {
  if (cause === undefined || cause === null) {
    return undefined;
  }
  if (typeof cause === 'string') {
    return redactSecrets(cause, extraSecrets);
  }
  if (typeof cause === 'number' || typeof cause === 'boolean') {
    return cause;
  }
  if (cause instanceof Error) {
    if (depth >= MAX_CAUSE_DEPTH) {
      return redactSecrets(`${cause.name}: ${cause.message}`, extraSecrets);
    }
    return sanitizeErrorForHook(cause, { depth: depth + 1, extraSecrets });
  }
  return redactSecrets(String(cause), extraSecrets);
};

const instantiateFastGptErrorView = (
  source: FastGptError,
  details: FastGptErrorDetails
): FastGptError => {
  if (source instanceof FastGptAuthError) return new FastGptAuthError(details);
  if (source instanceof FastGptBadRequestError) return new FastGptBadRequestError(details);
  if (source instanceof FastGptNotFoundError) return new FastGptNotFoundError(details);
  if (source instanceof FastGptConflictError) return new FastGptConflictError(details);
  if (source instanceof FastGptRateLimitError) return new FastGptRateLimitError(details);
  if (source instanceof FastGptServerError) return new FastGptServerError(details);
  if (source instanceof FastGptTimeoutError) return new FastGptTimeoutError(details);
  if (source instanceof FastGptNetworkError) return new FastGptNetworkError(details);
  return new FastGptError(details);
};

/**
 * 为可观测性钩子构造独立的脱敏错误视图：
 * 仅保留受控白名单字段，递归脱敏 message / stack / url / cause，剥离原始异常及其 cause 上可能携带凭据的任意附加属性。
 */
export const sanitizeErrorForHook = (
  error: Error,
  options?: { depth?: number; extraSecrets?: ReadonlyArray<string> }
): Error => {
  const depth = options?.depth ?? 0;
  const extraSecrets = options?.extraSecrets;
  const sanitizedCause =
    'cause' in error && error.cause !== undefined
      ? sanitizeCauseForHook({ cause: error.cause, depth, extraSecrets })
      : undefined;

  if (error instanceof FastGptError) {
    const view = instantiateFastGptErrorView(error, {
      message: redactSecrets(error.message, extraSecrets),
      httpStatus: error.httpStatus,
      serverCode: error.serverCode,
      statusText:
        error.statusText !== undefined ? redactSecrets(error.statusText, extraSecrets) : undefined,
      requestId: error.requestId,
      url: error.url !== undefined ? redactSecrets(error.url, extraSecrets) : undefined,
      ...(sanitizedCause !== undefined ? { cause: sanitizedCause } : {}),
      ...(extraSecrets !== undefined ? { extraSecrets } : {})
    });
    if (typeof error.stack === 'string') {
      view.stack = redactSecrets(error.stack, extraSecrets);
    }
    return view;
  }

  const view = new Error(
    redactSecrets(error.message, extraSecrets),
    sanitizedCause !== undefined ? { cause: sanitizedCause } : undefined
  );
  view.name = redactSecrets(error.name || 'Error', extraSecrets);
  if (typeof error.stack === 'string') {
    view.stack = redactSecrets(error.stack, extraSecrets);
  }
  return view;
};

const invokeSafely = async <T>({
  hook,
  context,
  logger,
  hookName,
  extraSecrets
}: {
  hook?: (ctx: T) => void | Promise<void>;
  context: T;
  logger: FastGptLogger | null;
  hookName: string;
  extraSecrets?: ReadonlyArray<string>;
}): Promise<void> => {
  if (hook === undefined) return;
  try {
    await hook(context);
  } catch (hookError) {
    logger?.warn?.(`FastGPT SDK ${hookName} hook threw an error`, {
      error: redactSecrets(
        hookError instanceof Error ? hookError.message : String(hookError),
        extraSecrets
      )
    });
  }
};

/**
 * 在发起 HTTP 请求前记录脱敏日志并触发 onRequest 钩子。
 */
export const notifyRequestObservability = async ({
  hooks,
  logger,
  context,
  extraSecrets
}: {
  hooks?: FastGptHooks;
  logger: FastGptLogger | null;
  context: RequestHookContext;
  extraSecrets?: ReadonlyArray<string>;
}): Promise<void> => {
  const sanitizedContext: RequestHookContext = {
    ...context,
    url: redactSecrets(context.url, extraSecrets),
    headers: redactHeaders(context.headers, extraSecrets)
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
    hookName: 'onRequest',
    extraSecrets
  });
};

/**
 * 在收到 HTTP 响应后记录脱敏日志并触发 onResponse 钩子。
 */
export const notifyResponseObservability = async ({
  hooks,
  logger,
  context,
  extraSecrets
}: {
  hooks?: FastGptHooks;
  logger: FastGptLogger | null;
  context: ResponseHookContext;
  extraSecrets?: ReadonlyArray<string>;
}): Promise<void> => {
  const sanitizedContext: ResponseHookContext = {
    ...context,
    url: redactSecrets(context.url, extraSecrets)
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
    hookName: 'onResponse',
    extraSecrets
  });
};

/**
 * 在请求发生业务错误、网络错误或超时时记录脱敏日志并触发 onError 钩子。
 */
export const notifyErrorObservability = async ({
  hooks,
  logger,
  context,
  extraSecrets
}: {
  hooks?: FastGptHooks;
  logger: FastGptLogger | null;
  context: ErrorHookContext;
  extraSecrets?: ReadonlyArray<string>;
}): Promise<void> => {
  const sanitizedError = sanitizeErrorForHook(context.error, { extraSecrets });
  const sanitizedContext: ErrorHookContext = {
    ...context,
    url: redactSecrets(context.url, extraSecrets),
    error: sanitizedError
  };

  logger?.error?.(`${sanitizedContext.method} ${sanitizedContext.url} failed`, {
    operationId: sanitizedContext.operationId,
    durationMs: sanitizedContext.durationMs,
    attempt: sanitizedContext.attempt,
    errorName: sanitizedError.name,
    errorMessage: sanitizedError.message
  });

  await invokeSafely({
    hook: hooks?.onError,
    context: sanitizedContext,
    logger,
    hookName: 'onError',
    extraSecrets
  });
};
