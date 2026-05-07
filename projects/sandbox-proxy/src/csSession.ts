import { LRUCache } from 'lru-cache';
import { env } from './env';
import { getLogger, LogCategories } from './logger';

const logger = getLogger(LogCategories.MODULE.SANDBOX_PROXY.SERVER);

type CsSession = { name: string; value: string };

// Bound both upstream calls; password fetch goes through app exec adapter so it gets a wider budget.
const PASSWORD_FETCH_TIMEOUT_MS = 8000;
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

// Coalesce per-sandboxId so iframe first paint doesn't race N parallel /login attempts.
const inFlight = new Map<string, Promise<CsSession | null>>();

// Common code-server cookie names across versions / forks.
const COOKIE_RE = /(?:^|;\s*)(code-server-session|coder-session|key)=([^;]+)/i;

export const evictCsSession = (sandboxId: string) => {
  sessionCache.delete(sandboxId);
  loginBackoff.delete(sandboxId);
};

export const deriveCsLoginTarget = (target: string, url: string): string => {
  const m = url.match(/^\/proxy\/(\d+)/);
  return m ? `${target}/proxy/${m[1]}` : target;
};

/**
 * Fetch code-server password from FastGPT internal endpoint.
 */
const fetchPasswordFromApp = async (sandboxId: string): Promise<string | null> => {
  try {
    const resp = await fetch(`${env.appBaseUrl}/api/core/sandbox/internal/csPassword`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.secret}`
      },
      body: JSON.stringify({ sandboxId }),
      signal: AbortSignal.timeout(PASSWORD_FETCH_TIMEOUT_MS)
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { password?: string | null };
    return data.password || null;
  } catch (e) {
    logger.error(`csLogin password fetch sandboxId=${sandboxId}: ${(e as Error).message}`);
    return null;
  }
};

const doCsLogin = async (sandboxId: string, target: string): Promise<CsSession | null> => {
  const password = await fetchPasswordFromApp(sandboxId);
  if (!password) {
    loginBackoff.set(sandboxId, true);
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
    loginBackoff.set(sandboxId, true);
    return null;
  }

  if (resp.status !== 302 && resp.status !== 301) {
    loginBackoff.set(sandboxId, true);
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
    loginBackoff.set(sandboxId, true);
    return null;
  }

  sessionCache.set(sandboxId, session);
  return session;
};

/**
 * Ensure a cached code-server session exists for this sandbox.
 */
export const ensureCsSession = async (
  sandboxId: string,
  target: string
): Promise<CsSession | null> => {
  const cached = sessionCache.get(sandboxId);
  if (cached) return cached;

  if (loginBackoff.has(sandboxId)) return null;

  const ongoing = inFlight.get(sandboxId);
  if (ongoing) return ongoing;

  const p = doCsLogin(sandboxId, target).finally(() => inFlight.delete(sandboxId));
  inFlight.set(sandboxId, p);
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
