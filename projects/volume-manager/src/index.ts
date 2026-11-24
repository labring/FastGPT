import { createHash, timingSafeEqual } from 'crypto';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { env } from './env';
import { DockerVolumeDriver } from './drivers/DockerVolumeDriver';
import type { IVolumeDriver } from './drivers/IVolumeDriver';
import { K8sVolumeDriver } from './drivers/K8sVolumeDriver';
import { volumeRoutes } from './routes/volumes';
import { configureLogger, disposeLogger, getLogger, LogCategories } from './utils/logger';

const serverLogger = getLogger(LogCategories.MODULE.VOLUME_MANAGER.SERVER);
const apiLogger = getLogger(LogCategories.MODULE.VOLUME_MANAGER.API);

const sha256 = (value: string) => createHash('sha256').update(value).digest();

const isBearerTokenMatch = (authHeader: string | undefined, expectedToken: string): boolean => {
  if (!authHeader) return false;
  return timingSafeEqual(sha256(authHeader), sha256(`Bearer ${expectedToken}`));
};

/** 构造 Volume Manager HTTP 应用，统一挂载鉴权、路由与错误映射，便于直接单测。 */
export function createVolumeManagerApp(driver: IVolumeDriver, authToken = env.VM_AUTH_TOKEN): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      if (err.status >= 500) {
        apiLogger.error('Upstream or server error', {
          status: err.status,
          method: c.req.method,
          path: c.req.path,
          error: err
        });
      } else {
        // 4xx 属于预期业务/鉴权拒绝，按 warn 级别记录且不打印堆栈，避免污染错误告警日志。
        apiLogger.warn('Request rejected', {
          status: err.status,
          method: c.req.method,
          path: c.req.path,
          message: err.message
        });
      }
      return c.json({ error: err.message }, err.status);
    }
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      apiLogger.error('Request timed out', {
        method: c.req.method,
        path: c.req.path,
        error: err
      });
      return c.json({ error: err.message || 'Upstream volume operation timed out' }, 504);
    }
    apiLogger.error('Unhandled request error', {
      method: c.req.method,
      path: c.req.path,
      error: err
    });
    return c.json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
  });

  // Health check (no auth)
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Auth middleware for /v1/* routes
  app.use('/v1/*', async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!isBearerTokenMatch(authHeader, authToken)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
  });

  // Volume routes
  app.route('/v1/volumes', volumeRoutes(driver));

  return app;
}

if (process.env.VITEST !== 'true') {
  await configureLogger();

  const driver = env.VM_RUNTIME === 'docker' ? new DockerVolumeDriver() : new K8sVolumeDriver();
  const app = createVolumeManagerApp(driver);

  const server = serve({
    port: env.PORT,
    fetch: app.fetch
  });

  serverLogger.info('Volume Manager listening', { port: env.PORT, runtime: env.VM_RUNTIME });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const closePromise = new Promise<void>((resolve) => server.close(() => resolve()));
    if ('closeIdleConnections' in server && typeof server.closeIdleConnections === 'function') {
      server.closeIdleConnections();
    }
    await closePromise;
    await disposeLogger();
    await new Promise<void>((resolve) =>
      process.stdout.write('', () => process.stderr.write('', () => resolve()))
    );
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}
