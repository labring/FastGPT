import { getLogger } from '@fastgpt-sdk/otel/logger';
import { Hono, type Context } from 'hono';
import {
  SandboxVolumeEnsureRequestSchema,
  SandboxVolumeListQuerySchema,
  SandboxVolumeNameSchema
} from '@fastgpt/global/core/ai/sandbox/volume';
import type { IVolumeDriver } from '../drivers/IVolumeDriver';
import { LogCategories } from '../utils/logger';

const logger = getLogger(LogCategories.MODULE.VOLUME_MANAGER.API);

/** 在 HTTP 边界校验请求后调用对应运行时驱动；业务冲突异常统一交由上层 `app.onError` 映射。 */
export function volumeRoutes(driver: IVolumeDriver): Hono {
  const app = new Hono();

  const parseClaimAndDeployment = (c: Context) => {
    const claimParsed = SandboxVolumeNameSchema.safeParse(c.req.param('claimName'));
    if (!claimParsed.success) {
      return { errorResponse: c.json({ error: 'Invalid claimName' }, 400) };
    }
    const queryParsed = SandboxVolumeListQuerySchema.safeParse(c.req.query());
    if (!queryParsed.success) {
      return {
        errorResponse: c.json(
          { error: 'Invalid request query', details: queryParsed.error.issues },
          400
        )
      };
    }
    return { claimName: claimParsed.data, deploymentId: queryParsed.data.deploymentId };
  };

  app.get('/', async (c) => {
    const parsed = SandboxVolumeListQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: 'Invalid request query', details: parsed.error.issues }, 400);
    }
    logger.info('GET /v1/volumes');
    const items = await driver.list(parsed.data.deploymentId);
    return c.json({ items }, 200);
  });

  app.post('/ensure', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = SandboxVolumeEnsureRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', details: parsed.error.issues }, 400);
    }

    logger.info(`POST /v1/volumes/ensure claimName=${parsed.data.claimName}`);
    const result = await driver.ensure(parsed.data);
    const status = result.created ? 201 : 200;
    logger.info(
      `ensure done claimName=${result.claimName} created=${result.created} status=${status}`
    );
    return c.json(result, status);
  });

  app.post('/:claimName/unmount', async (c) => {
    const parsed = parseClaimAndDeployment(c);
    if ('errorResponse' in parsed) return parsed.errorResponse;

    logger.info(`POST /v1/volumes/${parsed.claimName}/unmount`);
    await driver.unmount(parsed.claimName, parsed.deploymentId);
    return c.body(null, 204);
  });

  app.delete('/:claimName', async (c) => {
    const parsed = parseClaimAndDeployment(c);
    if ('errorResponse' in parsed) return parsed.errorResponse;

    logger.info(`DELETE /v1/volumes/${parsed.claimName}`);
    await driver.remove(parsed.claimName, parsed.deploymentId);
    logger.info(`remove done claimName=${parsed.claimName}`);
    return c.body(null, 204);
  });

  return app;
}
