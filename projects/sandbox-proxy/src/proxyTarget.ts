import { LRUCache } from 'lru-cache';
import { env } from './env';
import { getLogger, LogCategories } from './logger';
import {
  SandboxProxyTargetBodySchema,
  SandboxProxyTargetResponseSchema,
  type SandboxProxyTargetResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import type { SandboxProxyService } from '@fastgpt/global/core/ai/sandbox/proxyToken';

const logger = getLogger(LogCategories.MODULE.SANDBOX_PROXY.SERVER);
const TARGET_FETCH_TIMEOUT_MS = 8000;
const TARGET_CACHE_TTL_MS = 30_000;
const DEFAULT_REVISION = 'default';

const targetCache = new LRUCache<string, SandboxProxyTargetResponse>({
  max: 1000,
  ttl: TARGET_CACHE_TTL_MS
});

const inFlight = new Map<string, Promise<SandboxProxyTargetResponse | null>>();

const cacheKey = (sandboxId: string, service: SandboxProxyService, revision?: string) =>
  `${sandboxId}:${service}:${revision || DEFAULT_REVISION}`;

export const evictProxyTarget = (
  sandboxId: string,
  service?: SandboxProxyService,
  revision?: string
) => {
  if (service) {
    if (revision) {
      targetCache.delete(cacheKey(sandboxId, service, revision));
      return;
    }

    for (const key of targetCache.keys()) {
      if (key.startsWith(`${sandboxId}:${service}:`)) targetCache.delete(key);
    }
    return;
  }

  for (const key of targetCache.keys()) {
    if (key.startsWith(`${sandboxId}:`)) targetCache.delete(key);
  }
};

const fetchProxyTargetFromApp = async (
  sandboxId: string,
  service: SandboxProxyService
): Promise<SandboxProxyTargetResponse | null> => {
  try {
    const body = SandboxProxyTargetBodySchema.parse({ sandboxId, service });
    const resp = await fetch(`${env.appBaseUrl}/api/core/sandbox/internal/proxyTarget`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.secret}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TARGET_FETCH_TIMEOUT_MS)
    });

    if (!resp.ok) {
      logger.warning(
        `proxyTarget fetch failed sandboxId=${sandboxId} service=${service} status=${resp.status}`
      );
      return null;
    }

    return SandboxProxyTargetResponseSchema.parse(await resp.json());
  } catch (e) {
    logger.error(
      `proxyTarget fetch error sandboxId=${sandboxId} service=${service}: ${(e as Error).message}`
    );
    return null;
  }
};

export const resolveProxyTarget = async (
  sandboxId: string,
  service: SandboxProxyService,
  revision?: string
): Promise<SandboxProxyTargetResponse | null> => {
  const key = cacheKey(sandboxId, service, revision);
  const cached = targetCache.get(key);
  if (cached) return cached;

  const ongoing = inFlight.get(key);
  if (ongoing) return ongoing;

  const p = fetchProxyTargetFromApp(sandboxId, service).then((target) => {
    if (target) targetCache.set(key, target);
    return target;
  });
  inFlight.set(key, p);
  p.finally(() => inFlight.delete(key)).catch(() => undefined);
  return p;
};
