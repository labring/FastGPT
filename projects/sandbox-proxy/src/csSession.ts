import { env } from './env';
import { logger } from './logger';

const MAX_SIZE = 1000;

type CsSession = { name: string; value: string };
type Entry = CsSession & { exp: number };
const store = new Map<string, Entry>();

// Backoff cache for repeated login failures.
const loginBackoff = new Map<string, number>();

// Common code-server cookie names across versions / forks.
const COOKIE_RE = /(?:^|;\s*)(code-server-session|coder-session|key)=([^;]+)/i;

const evictExpired = () => {
  const now = Date.now();
  for (const [k, v] of store) if (v.exp < now) store.delete(k);
};

const evictOldest = () => {
  let evictKey: string | null = null;
  let minExp = Infinity;
  for (const [k, v] of store) {
    if (v.exp < minExp) {
      minExp = v.exp;
      evictKey = k;
    }
  }
  if (evictKey) store.delete(evictKey);
};

const get = (sandboxId: string): CsSession | null => {
  const entry = store.get(sandboxId);
  if (!entry || entry.exp < Date.now()) {
    store.delete(sandboxId);
    return null;
  }
  entry.exp = Date.now() + env.tokenTtlSeconds * 1000;
  return { name: entry.name, value: entry.value };
};

const put = (sandboxId: string, session: CsSession) => {
  if (!store.has(sandboxId) && store.size >= MAX_SIZE) evictOldest();
  store.set(sandboxId, { ...session, exp: Date.now() + env.tokenTtlSeconds * 1000 });
  evictExpired();
};

export const evictCsSession = (sandboxId: string) => {
  store.delete(sandboxId);
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
      body: JSON.stringify({ sandboxId })
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { password?: string | null };
    return data.password || null;
  } catch (e) {
    logger.error(`csLogin password fetch sandboxId=${sandboxId}: ${(e as Error).message}`);
    return null;
  }
};

/**
 * Ensure a cached code-server session exists for this sandbox.
 */
export const ensureCsSession = async (
  sandboxId: string,
  target: string
): Promise<CsSession | null> => {
  const cached = get(sandboxId);
  if (cached) return cached;

  const backoffExp = loginBackoff.get(sandboxId);
  if (backoffExp && backoffExp > Date.now()) return null;
  if (backoffExp) loginBackoff.delete(sandboxId);

  const password = await fetchPasswordFromApp(sandboxId);
  if (!password) {
    loginBackoff.set(sandboxId, Date.now() + env.csLoginBackoffMs);
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
      redirect: 'manual'
    });
  } catch (e) {
    logger.error(`csLogin fetch sandboxId=${sandboxId}: ${(e as Error).message}`);
    return null;
  }

  if (resp.status !== 302 && resp.status !== 301) return null;

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
    loginBackoff.set(sandboxId, Date.now() + env.csLoginBackoffMs);
    return null;
  }

  put(sandboxId, session);
  return session;
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
