import { Hono } from 'hono';
import {
  SandboxVolumeEnsureRequestSchema,
  SandboxVolumeNameSchema
} from '@fastgpt/global/core/ai/sandbox/volume';
import type { IVolumeDriver } from '../drivers/IVolumeDriver';
import { getLogger, LogCategories } from '../utils/logger';

const logger = getLogger(LogCategories.MODULE.VOLUME_MANAGER.API);

export function volumeRoutes(driver: IVolumeDriver): Hono {
  const app = new Hono();

  // GET /v1/volumes
  app.get('/', async (c) => {
    const items = await driver.list();
    logger.debug('Listed volumes', { count: items.length });
    return c.json({ items }, 200);
  });

  // GET /v1/volumes/:claimName
  app.get('/:claimName', async (c) => {
    const parsedName = SandboxVolumeNameSchema.safeParse(c.req.param('claimName'));
    if (!parsedName.success) {
      return c.json({ error: 'Invalid volume name', details: parsedName.error.issues }, 400);
    }

    // [4.18.0 legacy compat, remove in >= 4.19.0] 允许只读核验 4.18.0 迁移期之前的无标签存量持久卷
    const allowLegacyUnlabeled = c.req.query('allowLegacyUnlabeled') === 'true';
    const found = allowLegacyUnlabeled
      ? await driver.exists(parsedName.data, { allowLegacyUnlabeled: true })
      : await driver.exists(parsedName.data);
    logger.debug('Inspected volume', { claimName: parsedName.data, found, allowLegacyUnlabeled });
    if (!found) {
      return c.json({ error: 'Volume not found' }, 404);
    }
    return c.json({ claimName: parsedName.data }, 200);
  });

  // POST /v1/volumes/ensure
  app.post('/ensure', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = SandboxVolumeEnsureRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', details: parsed.error.issues }, 400);
    }

    const { claimName, storageSize } = parsed.data;
    const result = await driver.ensure({
      claimName,
      storageSize
    });
    const status = result.created ? 201 : 200;
    logger.info('Ensured volume', { claimName: result.claimName, created: result.created });
    return c.json(result, status);
  });

  // DELETE /v1/volumes/:claimName
  app.delete('/:claimName', async (c) => {
    const parsedName = SandboxVolumeNameSchema.safeParse(c.req.param('claimName'));
    if (!parsedName.success) {
      return c.json({ error: 'Invalid volume name', details: parsedName.error.issues }, 400);
    }

    // [4.18.0 legacy compat, remove in >= 4.19.0] 允许清理 4.18.0 迁移期之前的无标签存量孤儿卷
    const allowLegacyUnlabeled = c.req.query('allowLegacyUnlabeled') === 'true';
    if (allowLegacyUnlabeled) {
      await driver.remove(parsedName.data, { allowLegacyUnlabeled: true });
    } else {
      await driver.remove(parsedName.data);
    }
    logger.info('Removed volume', { claimName: parsedName.data, allowLegacyUnlabeled });
    return c.body(null, 204);
  });

  return app;
}
