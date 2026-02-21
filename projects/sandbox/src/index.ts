import './env'; // dotenv 最先加载
import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { z } from 'zod';
import { config } from './config';
import { JsRunner } from './runner/js-runner';
import { PythonRunner } from './runner/python-runner';
import { getSemaphoreStats } from './runner/base';
import type { ExecuteOptions } from './types';

/** 请求体校验 schema */
const executeSchema = z.object({
  code: z.string().min(1).max(1024 * 1024), // 最大 1MB 代码
  variables: z.record(z.string(), z.any()).default({}),
  limits: z.object({
    timeoutMs: z.number().int().positive().optional(),
    memoryMB: z.number().int().positive().optional(),
  }).optional(),
});

const app = new Hono();

/** Runner 实例（单例） */
const runnerConfig = {
  defaultTimeoutMs: config.defaultTimeoutMs,
  defaultMemoryMB: config.defaultMemoryMB
};

const jsRunner = new JsRunner(runnerConfig);
const pythonRunner = new PythonRunner(runnerConfig);

/** 健康检查（不需要认证） */
app.get('/health', (c) => {
  return c.json({ status: 'ok', version: '5.0.0', concurrency: getSemaphoreStats() });
});

/** 认证中间件：仅当配置了 token 时启用 */
if (config.token) {
  app.use('/sandbox/*', bearerAuth({ token: config.token }));
} else {
  console.warn('⚠️  WARNING: SANDBOX_TOKEN is not set. API endpoints are unauthenticated. Set SANDBOX_TOKEN in production!');
}

/** JS 执行 */
app.post('/sandbox/js', async (c) => {
  try {
    const raw = await c.req.json();
    const parsed = executeSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ success: false, message: `Invalid request: ${parsed.error.issues[0]?.message || 'validation failed'}` }, 400);
    }
    const result = await jsRunner.execute(parsed.data as ExecuteOptions);
    return c.json(result);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Internal server error'
    });
  }
});

/** Python 执行 */
app.post('/sandbox/python', async (c) => {
  try {
    const raw = await c.req.json();
    const parsed = executeSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ success: false, message: `Invalid request: ${parsed.error.issues[0]?.message || 'validation failed'}` }, 400);
    }
    const result = await pythonRunner.execute(parsed.data as ExecuteOptions);
    return c.json(result);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Internal server error'
    });
  }
});

/** 启动服务 */
console.log(`Sandbox server starting on port ${config.port}...`);

export default {
  port: config.port,
  fetch: app.fetch
};

/** 导出 app 供测试使用 */
export { app };
