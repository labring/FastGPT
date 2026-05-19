import { LRUCache } from 'lru-cache';
import { env } from './env';
import { getLogger, LogCategories } from './logger';

const logger = getLogger(LogCategories.MODULE.SANDBOX_PROXY.SERVER);

type CsSession = { name: string; value: string };

const CS_LOGIN_TIMEOUT_MS = 5000;

/**
 * Cache for code-server sessions.
 * TTL is controlled by SANDBOX_PROXY_TOKEN_TTL.
 * Max 1000 sandboxes per proxy instance.
 */
const sessionCache = new LRUCache<string, CsSession>({
  max: 1000,
  ttl: env.tokenTtlSeconds * 1000,
  updateAgeOnGet: true
});

/**
 * Backoff cache to prevent spamming the app/upstream after login failures.
 */
const loginBackoff = new LRUCache<string, boolean>({
  max: 1000,
  ttl: env.csLoginBackoffMs
});

// Coalesce per sandbox upstream so iframe first paint doesn't race N parallel /login attempts.
const inFlight = new Map<string, Promise<CsSession | null>>();

// Common code-server cookie names across versions / forks.
const COOKIE_RE = /(?:^|;\s*)(code-server-session|coder-session|key)=([^;]+)/i;

const sessionKey = (sandboxId: string, target: string) => `${sandboxId}:${target}`;

const deleteBySandboxIdPrefix = <T>(cache: LRUCache<string, T>, sandboxId: string) => {
  for (const key of cache.keys()) {
    if (key.startsWith(`${sandboxId}:`)) cache.delete(key);
  }
};

export const evictCsSession = (sandboxId: string) => {
  deleteBySandboxIdPrefix(sessionCache, sandboxId);
  deleteBySandboxIdPrefix(loginBackoff, sandboxId);
  for (const key of inFlight.keys()) {
    if (key.startsWith(`${sandboxId}:`)) inFlight.delete(key);
  }
};

type ProxyPathMapping = {
  publicPath: string;
  basePath: string;
};

const normalizePrefix = (path: string): string => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
};

const joinPath = (basePath: string, suffix: string): string => {
  const base = basePath ? normalizePrefix(basePath) : '';
  const normalizedSuffix = suffix.startsWith('/')
    ? suffix
    : suffix.startsWith('?')
      ? `/${suffix}`
      : `/${suffix}`;
  return base ? `${base}${normalizedSuffix}` : normalizedSuffix;
};

const getMapping = (mapping: ProxyPathMapping): ProxyPathMapping => {
  return {
    publicPath: normalizePrefix(mapping.publicPath),
    basePath: mapping.basePath ? normalizePrefix(mapping.basePath) : ''
  };
};

const getProxySuffix = (url: string, publicPath: string): string | null => {
  const prefix = normalizePrefix(publicPath);
  if (url === prefix) return '/';
  if (url.startsWith(`${prefix}?`)) return `/${url.slice(prefix.length)}`;
  if (url.startsWith(`${prefix}/`)) return url.slice(prefix.length);
  return null;
};

const getBasePathSuffix = (url: string, basePath: string): string | null => {
  if (!basePath) return url.startsWith('/') ? url : `/${url}`;

  const prefix = normalizePrefix(basePath);
  if (url === prefix) return '/';
  if (url.startsWith(`${prefix}?`)) return `/${url.slice(prefix.length)}`;
  if (url.startsWith(`${prefix}/`)) return url.slice(prefix.length);
  return null;
};

export const rewriteProxyRequestUrl = (url: string, mapping: ProxyPathMapping): string => {
  const { publicPath, basePath } = getMapping(mapping);
  const suffix = getProxySuffix(url, publicPath);
  if (suffix !== null) return joinPath(basePath, suffix);

  const baseSuffix = getBasePathSuffix(url, basePath);
  return baseSuffix === null ? url : joinPath(basePath, baseSuffix);
};

export const deriveCsLoginTarget = (
  target: string,
  url: string,
  mapping: ProxyPathMapping
): string => {
  const { publicPath, basePath } = getMapping(mapping);
  const suffix = getProxySuffix(url, publicPath) ?? getBasePathSuffix(url, basePath);
  return suffix === null ? target : `${target}${basePath}`;
};

export const isProxyMappedRequestUrl = (url: string, mapping: ProxyPathMapping): boolean => {
  const { publicPath, basePath } = getMapping(mapping);
  return getProxySuffix(url, publicPath) !== null || getBasePathSuffix(url, basePath) !== null;
};

const doCsLogin = async (
  sandboxId: string,
  key: string,
  target: string,
  password?: string
): Promise<CsSession | null> => {
  if (!password) {
    loginBackoff.set(key, true);
    return null;
  }

  let resp: Response;
  try {
    resp = await fetch(`${target}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        origin: new URL(target).origin
      },
      body: `password=${encodeURIComponent(password)}`,
      redirect: 'manual',
      signal: AbortSignal.timeout(CS_LOGIN_TIMEOUT_MS)
    });
  } catch (e) {
    logger.error(`csLogin fetch sandboxId=${sandboxId}: ${(e as Error).message}`);
    loginBackoff.set(key, true);
    return null;
  }

  if (resp.status !== 302 && resp.status !== 301) {
    loginBackoff.set(key, true);
    return null;
  }

  const setCookies: string[] = (
    resp.headers as unknown as { getSetCookie?: () => string[] }
  ).getSetCookie?.() ?? [resp.headers.get('set-cookie') ?? ''];

  let session: CsSession | null = null;
  for (const h of setCookies) {
    const m = h.match(COOKIE_RE);
    if (m) {
      session = { name: m[1], value: m[2].trim() };
      break;
    }
  }

  if (!session) {
    // code-server upgrades have historically renamed this cookie; surface unknown
    // names so we can update COOKIE_RE before users hit silent backoff.
    const cookieNames = setCookies
      .map((h) => h.split('=')[0]?.trim())
      .filter(Boolean)
      .join(',');
    if (cookieNames) {
      logger.warning(
        `csLogin sandboxId=${sandboxId} 302 carried unrecognised Set-Cookie names=[${cookieNames}]; update COOKIE_RE in csSession.ts if code-server changed its session cookie`
      );
    }
    loginBackoff.set(key, true);
    return null;
  }

  sessionCache.set(key, session);
  return session;
};

/**
 * Ensure a cached code-server session exists for this sandbox.
 */
export const ensureCsSession = async (
  sandboxId: string,
  target: string,
  password?: string
): Promise<CsSession | null> => {
  const key = sessionKey(sandboxId, target);
  const cached = sessionCache.get(key);
  if (cached) return cached;

  if (loginBackoff.has(key)) return null;

  const ongoing = inFlight.get(key);
  if (ongoing) return ongoing;

  const p = doCsLogin(sandboxId, key, target, password).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
};

/** Replace any code-server cookie in the request header with the given session value. */
export const injectCsKey = (reqHeaders: Record<string, unknown>, session: CsSession) => {
  const existing = (reqHeaders.cookie as string | undefined) ?? '';
  const STRIP = ['code-server-session', 'coder-session', 'key'];
  const stripped = existing
    .split(';')
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      const name = s.split('=')[0].trim().toLowerCase();
      return !STRIP.includes(name);
    })
    .join('; ');
  const inject = `${session.name}=${session.value}`;
  reqHeaders.cookie = stripped ? `${stripped}; ${inject}` : inject;
};
