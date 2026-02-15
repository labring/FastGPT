import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { config } from './config';
import { JsRunner } from './runner/js-runner';
import { PythonRunner } from './runner/python-runner';
import type { ExecuteOptions } from './types';

const app = new Hono();

/** Runner 实例（单例） */
const runnerConfig = {
  defaultTimeoutMs: config.defaultTimeoutMs,
  defaultMemoryMB: config.defaultMemoryMB,
  defaultDiskMB: config.defaultDiskMB
};

const jsRunner = new JsRunner(runnerConfig);
const pythonRunner = new PythonRunner(runnerConfig);

/** 健康检查（不需要认证） */
app.get('/health', (c) => {
  return c.json({ status: 'ok', version: '5.0.0' });
});

/** 认证中间件：仅当配置了 token 时启用 */
if (config.token) {
  app.use('/sandbox/*', bearerAuth({ token: config.token }));
}

/** JS 执行 */
app.post('/sandbox/js', async (c) => {
  try {
    const body = (await c.req.json()) as ExecuteOptions;
    const result = await jsRunner.execute(body);
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
    const body = (await c.req.json()) as ExecuteOptions;
    const result = await pythonRunner.execute(body);
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
