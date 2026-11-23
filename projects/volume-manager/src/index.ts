import { createHash, timingSafeEqual } from 'crypto';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { env } from './env';
import { DockerVolumeDriver } from './drivers/DockerVolumeDriver';
import type { IVolumeDriver } from './drivers/IVolumeDriver';
import { K8sVolumeDriver } from './drivers/K8sVolumeDriver';
import { volumeRoutes } from './routes/volumes';
import { logError } from './utils/logger';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

const isBearerTokenMatch = (authHeader: string | undefined, expectedToken: string): boolean => {
  if (!authHeader) return false;
  return timingSafeEqual(sha256(authHeader), sha256(`Bearer ${expectedToken}`));
};

/** 构造 Volume Manager HTTP 应用，统一挂载鉴权、路由与错误映射，便于直接单测。 */
export function createVolumeManagerApp(driver: IVolumeDriver, authToken = env.VM_AUTH_TOKEN): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    logError(`Unhandled request error on ${c.req.method} ${c.req.path}:`, err);
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return c.json({ error: err.message || 'Upstream volume operation timed out' }, 504);
    }
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
  const driver = env.VM_RUNTIME === 'docker' ? new DockerVolumeDriver() : new K8sVolumeDriver();
  const app = createVolumeManagerApp(driver);

  serve({
    port: env.PORT,
    fetch: app.fetch
  });

  console.log(`[volume-manager] Listening on port ${env.PORT} (runtime: ${env.VM_RUNTIME})`);
}
