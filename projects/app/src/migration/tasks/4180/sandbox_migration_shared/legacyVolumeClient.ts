/**
 * 调用 `volume-manager` `/v1/legacy-volumes/:claimName` 的隔离客户端。
 *
 * 支持显式传入旧集群 `volume-manager` 端点（例如旧 Docker OpenSandbox -> 新 K8s OpenSandbox 跨环境迁移），
 * 并兼容旧环境仍运行未升级 `v0.3.x` `volume-manager`（无 `/v1/legacy-volumes` 路由）的场景。
 */
import { SandboxVolumeNameSchema } from '@fastgpt/global/core/ai/sandbox/volume';
import { getVolumeManagerEnvConfig } from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/config';
import { z } from 'zod';

const LegacyVolumeExistsResponseSchema = z.object({
  exists: z.boolean()
});

export type LegacyVolumeManagerEndpoint = {
  url: string;
  token?: string;
  volumeNamePrefix?: string;
};

function buildAuthHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function resolveEndpoint(override?: LegacyVolumeManagerEndpoint): {
  baseUrl: string;
  token?: string;
  volumeNamePrefix: string;
} {
  if (override) {
    return {
      baseUrl: override.url.replace(/\/+$/, ''),
      token: override.token,
      volumeNamePrefix: override.volumeNamePrefix ?? 'fastgpt-session'
    };
  }
  const vmConfig = getVolumeManagerEnvConfig();
  return {
    baseUrl: vmConfig.url.replace(/\/+$/, ''),
    token: vmConfig.token,
    volumeNamePrefix: vmConfig.volumeNamePrefix
  };
}

/** 预检 `volume-manager` 服务自身 `/health` 探针是否可达。 */
export async function checkVolumeManagerHealth(
  signal?: AbortSignal,
  endpoint?: LegacyVolumeManagerEndpoint
): Promise<void> {
  const { baseUrl } = resolveEndpoint(endpoint);
  const res = await fetch(`${baseUrl}/health`, {
    method: 'GET',
    signal
  });
  if (!res.ok) {
    throw new Error(`volume-manager health check failed with HTTP ${res.status}`);
  }
}

/**
 * 查询旧版无标签 PVC 或旧版普通 Docker `local` 命名卷是否存在。
 *
 * 当访问独立的旧 Docker `v0.3.x` `volume-manager`（尚未包含 `/v1/legacy-volumes` 路由，返回非 JSON 404）且开启
 * `allowMissingRouteFallback` 时，放行给下游 Docker OpenSandbox `createIfNotExists: false` 进行权威存在性校验。
 */
export async function checkLegacyVolumeExists(
  claimName: string,
  signal?: AbortSignal,
  options?: LegacyVolumeManagerEndpoint & { allowMissingRouteFallback?: boolean }
): Promise<boolean> {
  const parsedName = SandboxVolumeNameSchema.parse(claimName);
  const { baseUrl, token } = resolveEndpoint(options);
  const res = await fetch(`${baseUrl}/v1/legacy-volumes/${encodeURIComponent(parsedName)}`, {
    method: 'GET',
    headers: buildAuthHeaders(token),
    signal
  });

  if (
    res.status === 404 &&
    options?.allowMissingRouteFallback &&
    !(res.headers.get('content-type') ?? '').toLowerCase().includes('application/json')
  ) {
    return true;
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `volume-manager GET /v1/legacy-volumes/${parsedName} failed (${res.status}): ${detail}`
    );
  }

  return LegacyVolumeExistsResponseSchema.parse(await res.json()).exists;
}

/**
 * 幂等删除旧版无标签 PVC 或旧版普通 Docker `local` 命名卷（404 视为已清理）。
 *
 * 当面向独立旧集群 `volume-manager` 且对方仍为未升级的 `v0.3.x`（`/v1/legacy-volumes` 返回非 JSON 404）时，
 * 在严格校验 `${volumeNamePrefix}-` 前缀后降级调用 `DELETE /v1/volumes/:claimName` 完成物理回收。
 */
export async function deleteLegacyVolume(
  claimName: string,
  signal?: AbortSignal,
  options?: LegacyVolumeManagerEndpoint & { allowLegacyV03Fallback?: boolean }
): Promise<void> {
  const parsedName = SandboxVolumeNameSchema.parse(claimName);
  const { baseUrl, token, volumeNamePrefix } = resolveEndpoint(options);
  const res = await fetch(`${baseUrl}/v1/legacy-volumes/${encodeURIComponent(parsedName)}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(token),
    signal
  });

  if (
    res.status === 404 &&
    options?.allowLegacyV03Fallback &&
    !(res.headers.get('content-type') ?? '').toLowerCase().includes('application/json')
  ) {
    const requiredPrefix = `${volumeNamePrefix.toLowerCase()}-`;
    if (!parsedName.startsWith(requiredPrefix)) {
      throw new Error(
        `Refusing fallback DELETE /v1/volumes/${parsedName}: volume does not match prefix ${requiredPrefix}`
      );
    }
    const fallbackRes = await fetch(`${baseUrl}/v1/volumes/${encodeURIComponent(parsedName)}`, {
      method: 'DELETE',
      headers: buildAuthHeaders(token),
      signal
    });
    if (!fallbackRes.ok && fallbackRes.status !== 404) {
      const detail = await fallbackRes.text().catch(() => '');
      throw new Error(
        `volume-manager fallback DELETE /v1/volumes/${parsedName} failed (${fallbackRes.status}): ${detail}`
      );
    }
    return;
  }

  if (!res.ok && res.status !== 404) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `volume-manager DELETE /v1/legacy-volumes/${parsedName} failed (${res.status}): ${detail}`
    );
  }
}
