/**
 * 隔离式旧版无标签卷窄权限 HTTP 路由（挂载于 `/v1/legacy-volumes`，复用上层 Bearer Token 鉴权与异常映射）。
 *
 * - `GET /:claimName` -> `{ exists: boolean }`（供迁移任务 1 预检旧卷是否存在）
 * - `DELETE /:claimName` -> `{ ok: true }`（供清理任务 2 物理回收旧卷，404 幂等成功）
 */
import { getLogger } from '@fastgpt-sdk/otel/logger';
import { Hono } from 'hono';
import { SandboxVolumeNameSchema } from '@fastgpt/global/core/ai/sandbox/volume';
import { env } from '../env';
import { LogCategories } from '../utils/logger';
import type { ILegacyVolumeCleaner } from './env';
import { LegacyDockerVolumeCleaner } from './legacyDockerVolumes';
import { LegacyK8sVolumeCleaner } from './legacyK8sVolumes';

const logger = getLogger(LogCategories.MODULE.VOLUME_MANAGER.API);

/** 构建旧卷窄权限路由；默认按 `VM_RUNTIME` 懒加载对应清理器。 */
export function legacyVolumeRoutes(cleaner?: ILegacyVolumeCleaner): Hono {
  const app = new Hono();
  let resolvedCleaner = cleaner;

  const getCleaner = (): ILegacyVolumeCleaner => {
    resolvedCleaner ??=
      env.VM_RUNTIME === 'docker' ? new LegacyDockerVolumeCleaner() : new LegacyK8sVolumeCleaner();
    return resolvedCleaner;
  };

  app.get('/:claimName', async (c) => {
    const parsed = SandboxVolumeNameSchema.safeParse(c.req.param('claimName'));
    if (!parsed.success) {
      return c.json({ error: 'Invalid claimName' }, 400);
    }

    const exists = await getCleaner().exists(parsed.data);
    return c.json({ exists }, 200);
  });

  app.delete('/:claimName', async (c) => {
    const parsed = SandboxVolumeNameSchema.safeParse(c.req.param('claimName'));
    if (!parsed.success) {
      return c.json({ error: 'Invalid claimName' }, 400);
    }

    logger.info(`DELETE /v1/legacy-volumes/${parsed.data}`);
    await getCleaner().remove(parsed.data);
    logger.info(`legacy remove done claimName=${parsed.data}`);
    return c.json({ ok: true }, 200);
  });

  return app;
}
