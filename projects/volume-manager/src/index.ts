import { createHash, timingSafeEqual } from 'node:crypto';
import { getLogger } from '@fastgpt-sdk/otel/logger';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { env } from './env';
import { DockerVolumeDriver } from './drivers/DockerVolumeDriver';
import { VolumeOwnershipError, type IVolumeDriver } from './drivers/IVolumeDriver';
import { K8sVolumeDriver } from './drivers/K8sVolumeDriver';
import { LegacyVolumeForbiddenPrefixError, type ILegacyVolumeCleaner } from './legacy/env';
import { legacyVolumeRoutes } from './legacy/legacyVolumeRoutes';
import { volumeRoutes } from './routes/volumes';
import { configureLogger, LogCategories } from './utils/logger';

const serverLogger = getLogger(LogCategories.MODULE.VOLUME_MANAGER.SERVER);

/**
 * 使用 SHA-256 摘要与常量时间比较校验 Bearer Token，防止通过响应耗时推测密钥长度或前缀。
 */
export function verifyBearerAuthHeader(
  authHeader: string | undefined,
  expectedToken: string
): boolean {
  if (typeof authHeader !== 'string' || !expectedToken) {
    return false;
  }
  const actualDigest = createHash('sha256').update(authHeader, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(`Bearer ${expectedToken}`, 'utf8').digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

/**
 * 创建 Volume Manager HTTP 服务实例，注册常量时间 Bearer 鉴权与统一 JSON 异常处理器。
 */
export function createVolumeManagerApp(params: {
  driver: IVolumeDriver;
  authToken: string;
  legacyCleaner?: ILegacyVolumeCleaner;
}): Hono {
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.use('/v1/*', async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!verifyBearerAuthHeader(authHeader, params.authToken)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
  });

  app.route('/v1/volumes', volumeRoutes(params.driver));
  app.route('/v1/legacy-volumes', legacyVolumeRoutes(params.legacyCleaner));

  app.onError((err, c) => {
    if (err instanceof LegacyVolumeForbiddenPrefixError) {
      serverLogger.warn(`Forbidden legacy volume prefix: ${err.message}`);
      return c.json({ error: err.message }, 403);
    }
    if (err instanceof VolumeOwnershipError) {
      serverLogger.warn(`Volume ownership mismatch: ${err.message}`);
      return c.json({ error: err.message }, 409);
    }
    serverLogger.error('Unhandled volume-manager error', { error: err });
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}

if (process.env.VITEST !== 'true') {
  await configureLogger();

  const driver = env.VM_RUNTIME === 'docker' ? new DockerVolumeDriver() : new K8sVolumeDriver();
  const app = createVolumeManagerApp({ driver, authToken: env.VM_AUTH_TOKEN });

  serve({
    port: env.PORT,
    fetch: app.fetch
  });

  serverLogger.info(`Listening on port ${env.PORT} (runtime: ${env.VM_RUNTIME})`);
}
