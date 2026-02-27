import './env'; // dotenv 最先加载
import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { z } from 'zod';
import { config } from './config';
import { ProcessPool } from './pool/process-pool';
import { PythonProcessPool } from './pool/python-process-pool';
import type { ExecuteOptions } from './types';
import { getErrText } from './utils';

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
    console.log(`Process pools ready: JS=${config.poolSize}, Python=${config.poolSize} workers`);
  })
  .catch((err) => {
    console.log('Failed to init process pool:', err.message);
    process.exit(1);
  });

/** 健康检查（不需要认证） */
app.get('/health', (c) => {
  const jsStats = jsPool.stats;
  const pyStats = pythonPool.stats;
  const isReady = jsStats.total > 0 && pyStats.total > 0;
  return c.json({ status: isReady ? 'ok' : 'degraded' }, isReady ? 200 : 503);
});

/** 认证中间件：仅当配置了 token 时启用 */
if (config.token) {
  app.use('/sandbox/*', bearerAuth({ token: config.token }));
} else {
  console.warn(
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
    console.log('JS sandbox error:', err);
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
    console.log('Python sandbox error:', err);
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
console.log(`Sandbox server starting on port ${config.port}...`);

export default {
  port: config.port,
  fetch: app.fetch
};

/** 导出 app 和 poolReady 供测试使用 */
export { app, poolReady };
