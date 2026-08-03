import { Hono } from 'hono';
import { z } from 'zod';
import type { VolumeService } from '../services/VolumeService';
import { logInfo } from '../utils/logger';

export const EnsureVolumeBodySchema = z.object({
  claimName: z.string().trim().min(1).max(253),
  storageSize: z.string().trim().min(1).max(64).optional()
});
export type EnsureVolumeBody = z.infer<typeof EnsureVolumeBodySchema>;

export function volumeRoutes(service: VolumeService): Hono {
  const app = new Hono();

  // POST /v1/volumes/ensure
  app.post('/ensure', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = EnsureVolumeBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', details: parsed.error.issues }, 400);
    }

    const { claimName, storageSize } = parsed.data;
    logInfo(`POST /v1/volumes/ensure claimName=${claimName}`);
    const result = await service.ensure({ claimName, storageSize });
    const status = result.created ? 201 : 200;
    logInfo(`ensure done claimName=${result.claimName} created=${result.created} status=${status}`);
    return c.json(result, status);
  });

  // DELETE /v1/volumes/:claimName
  app.delete('/:claimName', async (c) => {
    const claimName = c.req.param('claimName');
    logInfo(`DELETE /v1/volumes/${claimName}`);
    await service.remove(claimName);
    logInfo(`remove done claimName=${claimName}`);
    return c.body(null, 204);
  });

  return app;
}
