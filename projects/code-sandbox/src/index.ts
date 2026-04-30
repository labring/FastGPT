import { env } from './env';
import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { serve } from '@hono/node-server';
import { z } from 'zod';
import { config } from './config';
import { ProcessPool } from './pool/process-pool';
import { PythonProcessPool } from './pool/python-process-pool';
import type { ExecuteOptions } from './types';
import { getErrText } from './utils';
import { configureLogger, getLogger, LogCategories } from './utils/logger';

await configureLogger();

const serverLogger = getLogger(LogCategories.MODULE.SANDBOX.SERVER);
const apiLogger = getLogger(LogCategories.MODULE.SANDBOX.API);

/** 请求体校验 schema */
const executeSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(5 * 1024 * 1024), // 最大 5MB 代码
  variables: z.record(z.string(), z.any()).default({})
});

const app = new Hono();

/** 进程池 */
const jsPool = new ProcessPool(config.poolSize);
const pythonPool = new PythonProcessPool(config.poolSize);

const poolReady = Promise.all([jsPool.init(), pythonPool.init()])
  .then(() => {
    serverLogger.info(
      `Process pools ready: JS=${config.poolSize}, Python=${config.poolSize} workers`
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
if (config.token) {
  app.use('/sandbox/*', bearerAuth({ token: config.token }));
} else {
  apiLogger.warn(
    '⚠️  WARNING: SANDBOX_TOKEN is not set. API endpoints are unauthenticated. Set SANDBOX_TOKEN in production!'
  );
}

/** JS 执行 */
app.post('/sandbox/js', async (c) => {
  try {
    const raw = await c.req.json();
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
    const result = await jsPool.execute(parsed.data as ExecuteOptions);
    return c.json(result);
  } catch (err: any) {
    return c.json({
      success: false,
      message: getErrText(err)
    });
  }
});

/** Python 执行 */
app.post('/sandbox/python', async (c) => {
  try {
    const raw = await c.req.json();
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
    const result = await pythonPool.execute(parsed.data as ExecuteOptions);
    return c.json(result);
  } catch (err: any) {
    return c.json({
      success: false,
      message: getErrText(err)
    });
  }
});

/** 查询可用模块 */
app.get('/sandbox/modules', (c) => {
  return c.json({
    success: true,
    data: {
      js: config.jsAllowedModules,
      python: config.pythonAllowedModules,
      builtinGlobals: ['SystemHelper.httpRequest']
    }
  });
});

/** 启动服务 */
serverLogger.info(`Sandbox server starting on port ${env.port}...`);

if (process.env.NODE_ENV !== 'test') {
  serve({ fetch: app.fetch, port: env.port }, (info) => {
    serverLogger.info(`Sandbox server listening on port ${info.port}`);
  });
}

/** 导出 app 和 poolReady 供测试使用 */
export { app, poolReady };
export default {
  port: env.port,
  fetch: app.fetch
};
