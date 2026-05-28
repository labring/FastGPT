import { env } from './env';
import { Hono, type Context } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { serve } from '@hono/node-server';
import { z } from 'zod';
import { ProcessPool } from './pool/process-pool';
import { PythonProcessPool } from './pool/python-process-pool';
import type { ExecuteOptions } from './types';
import { getErrText } from './utils';
import { configureLogger, getLogger, LogCategories } from './utils/logger';
import { QueueIdLimiter } from './utils/queue-id-limiter';

await configureLogger();

const serverLogger = getLogger(LogCategories.MODULE.SANDBOX.SERVER);
const apiLogger = getLogger(LogCategories.MODULE.SANDBOX.API);
const maxApiBodyBytes = env.SANDBOX_API_MAX_BODY_MB * 1024 * 1024;

class ApiBodyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413
  ) {
    super(message);
  }
}

/**
 * 流式读取并限制 API JSON body 总大小。
 *
 * `c.req.json()` 会先把完整 body 读入内存；这里在进入 JSON.parse/zod 前按字节数
 * 截断，防止攻击者通过超大的 variables 字段绕过 code 字段长度限制造成内存压力。
 */
async function readLimitedJsonBody(c: Context): Promise<unknown> {
  const contentLength = Number(c.req.header('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxApiBodyBytes) {
    throw new ApiBodyError(`Request body too large, max ${env.SANDBOX_API_MAX_BODY_MB}MB`, 413);
  }

  const body = c.req.raw.body;
  if (!body) {
    throw new ApiBodyError('Request body is empty', 400);
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxApiBodyBytes) {
        await reader.cancel();
        throw new ApiBodyError(`Request body too large, max ${env.SANDBOX_API_MAX_BODY_MB}MB`, 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (err) {
    if (err instanceof ApiBodyError) throw err;
    throw new ApiBodyError(getErrText(err, 'Invalid request body'), 400);
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ApiBodyError(`Invalid JSON body: ${getErrText(err)}`, 400);
  }
}

/** 请求体校验 schema */
const queueIdSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const queueId = value.trim();
  return queueId || undefined;
}, z.string().max(128).optional());

const executeSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(5 * 1024 * 1024), // 最大 5MB 代码
  variables: z.record(z.string(), z.any()).default({}),
  queueId: queueIdSchema
});

const app = new Hono();

/** 进程池 */
const jsPool = new ProcessPool(env.SANDBOX_POOL_SIZE);
const pythonPool = new PythonProcessPool(env.SANDBOX_POOL_SIZE);
const queueIdLimiter = new QueueIdLimiter(env.SANDBOX_QUEUE_ID_CONCURRENCY);

if (queueIdLimiter.enabled) {
  serverLogger.info(
    `QueueId limiter enabled: max ${env.SANDBOX_QUEUE_ID_CONCURRENCY} concurrent requests per queueId`
  );
}

const poolReady = Promise.all([jsPool.init(), pythonPool.init()])
  .then(() => {
    serverLogger.info(
      `Process pools ready: JS=${env.SANDBOX_POOL_SIZE}, Python=${env.SANDBOX_POOL_SIZE} workers`
    );
  })
  .catch((err) => {
    serverLogger.error('Failed to init process pool:', err.message);
    process.exit(1);
  });

/** 健康检查（不需要认证） */
app.get('/health', (c) => {
  const jsStats = jsPool.stats;
  const pyStats = pythonPool.stats;
  const isReady = jsStats.total > 0 && pyStats.total > 0;
  return c.json({ status: isReady ? 'ok' : 'degraded' }, isReady ? 200 : 503);
});

// 增加日志中间件，打印请求信息
app.use('/sandbox/*', async (c, next) => {
  apiLogger.info(`Request: ${c.req.url}`);
  await next();
});
// 增加响应日志，打印时间，状态，错误信息，并检查业务层面的成功状态
app.use('/sandbox/*', async (c, next) => {
  const startTime = Date.now();
  await next();

  const duration = Date.now() - startTime;
  const { method, url } = c.req;
  const { status } = c.res;

  // 尝试解析响应体以检查业务状态
  let businessSuccess = true;
  let errorMessage = '';

  try {
    // 克隆响应以读取内容（避免消耗原始响应流）
    const clonedRes = c.res.clone();
    const contentType = clonedRes.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      const body = await clonedRes.json();
      businessSuccess = body.success !== false; // 如果没有 success 字段，默认为成功
      errorMessage = body.message || '';
    }
  } catch (err) {
    // 解析失败时不影响日志记录
  }

  // 根据 HTTP 状态码和业务状态决定日志级别
  const isHttpSuccess = status >= 200 && status < 300;
  const isFullSuccess = isHttpSuccess && businessSuccess;

  const logMessage = `Response: ${url} | HTTP ${status} | Business ${businessSuccess ? '✓' : '✗'} | ${duration}ms${errorMessage ? ` | Error: ${errorMessage}` : ''}`;

  if (isFullSuccess) {
    apiLogger.info(logMessage);
  } else if (!businessSuccess) {
    apiLogger.warn(logMessage);
  } else {
    apiLogger.error(logMessage);
  }
});
/** 认证中间件：仅当配置了 token 时启用 */
if (env.SANDBOX_TOKEN) {
  app.use('/sandbox/*', bearerAuth({ token: env.SANDBOX_TOKEN }));
} else {
  apiLogger.warn(
    '⚠️  WARNING: SANDBOX_TOKEN is not set. API endpoints are unauthenticated. Set SANDBOX_TOKEN in production!'
  );
}

/** JS 执行 */
app.post('/sandbox/js', async (c) => {
  try {
    const raw = await readLimitedJsonBody(c);
    const parsed = executeSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          message: `Invalid request: ${parsed.error.issues[0]?.message || 'validation failed'}`
        },
        400
      );
    }
    const result = await queueIdLimiter.run(parsed.data.queueId, () =>
      jsPool.execute(parsed.data as ExecuteOptions)
    );
    return c.json(result);
  } catch (err: any) {
    const status = err instanceof ApiBodyError ? err.status : 200;
    return c.json(
      {
        success: false,
        message: getErrText(err)
      },
      status
    );
  }
});

/** Python 执行 */
app.post('/sandbox/python', async (c) => {
  try {
    const raw = await readLimitedJsonBody(c);
    const parsed = executeSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          message: `Invalid request: ${parsed.error.issues[0]?.message || 'validation failed'}`
        },
        400
      );
    }
    const result = await queueIdLimiter.run(parsed.data.queueId, () =>
      pythonPool.execute(parsed.data as ExecuteOptions)
    );
    return c.json(result);
  } catch (err: any) {
    const status = err instanceof ApiBodyError ? err.status : 200;
    return c.json(
      {
        success: false,
        message: getErrText(err)
      },
      status
    );
  }
});

/** 查询可用模块 */
app.get('/sandbox/modules', (c) => {
  return c.json({
    success: true,
    data: {
      js: env.SANDBOX_JS_ALLOWED_MODULES,
      python: env.SANDBOX_PYTHON_ALLOWED_MODULES,
      builtinGlobals: ['SystemHelper.httpRequest']
    }
  });
});

/** 启动服务 */
serverLogger.info(`Sandbox server starting on port ${env.SANDBOX_PORT}...`);

if (process.env.NODE_ENV !== 'test') {
  serve({ fetch: app.fetch, port: env.SANDBOX_PORT }, (info) => {
    serverLogger.info(`Sandbox server listening on port ${info.port}`);
  });
}

/** 导出 app 和 poolReady 供测试使用 */
export { app, poolReady };
export default {
  port: env.SANDBOX_PORT,
  fetch: app.fetch
};
