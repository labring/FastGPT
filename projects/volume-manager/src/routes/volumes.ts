import { Hono } from 'hono';
import {
  SandboxVolumeEnsureRequestSchema,
  SandboxVolumeNameSchema
} from '@fastgpt/global/core/ai/sandbox/volume';
import type { IVolumeDriver } from '../drivers/IVolumeDriver';
import { logInfo } from '../utils/logger';

export function volumeRoutes(driver: IVolumeDriver): Hono {
  const app = new Hono();

  // GET /v1/volumes
  app.get('/', async (c) => {
    logInfo('GET /v1/volumes');
    const items = await driver.list();
    logInfo(`list done count=${items.length}`);
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
    logInfo(`GET /v1/volumes/${parsedName.data}`);
    const found = allowLegacyUnlabeled
      ? await driver.exists(parsedName.data, { allowLegacyUnlabeled: true })
      : await driver.exists(parsedName.data);
    if (!found) {
      logInfo(`inspect not found claimName=${parsedName.data}`);
      return c.json({ error: 'Volume not found' }, 404);
    }
    logInfo(`inspect done claimName=${parsedName.data}`);
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
    logInfo(`POST /v1/volumes/ensure claimName=${claimName}`);
    const result = await driver.ensure({
      claimName,
      storageSize
    });
    const status = result.created ? 201 : 200;
    logInfo(`ensure done claimName=${result.claimName} created=${result.created} status=${status}`);
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
    logInfo(`DELETE /v1/volumes/${parsedName.data}`);
    if (allowLegacyUnlabeled) {
      await driver.remove(parsedName.data, { allowLegacyUnlabeled: true });
    } else {
      await driver.remove(parsedName.data);
    }
    logInfo(`remove done claimName=${parsedName.data}`);
    return c.body(null, 204);
  });

  return app;
}
