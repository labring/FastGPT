// Pure utility functions with minimal imports.
// Kept separate so server.ts (tsx CJS mode) can import without triggering
// the ESM-only @fastgpt-sdk/otel dependency chain.
import { randomBytes } from 'crypto';

// Parse subdomain proxy from Host header.
// Formats: {port}--{sandboxId-with-hyphens}.{domain} or {port}-{sandboxId-alphanumeric}.{domain}
export function parseSubdomainProxy(
  host: string | undefined
): { port: number; sandboxId: string } | null {
  if (!host) return null;
  // Strip optional :port suffix to get the pure hostname
  const hostname = host.split(':')[0];

  // New format: {port}--{sandboxId-with-hyphens}.{domain}
  // sandboxId: starts/ends with alnum, may contain hyphens, 8–36 chars
  let match = hostname.match(/^(\d+)--([a-zA-Z0-9][a-zA-Z0-9-]{6,34}[a-zA-Z0-9])\./);
  if (!match) {
    // Legacy format: {port}-{sandboxId-alphanumeric}.{domain}
    match = hostname.match(/^(\d+)-([a-zA-Z0-9]{8,32})\./);
  }

  if (!match) return null;
  const port = Number(match[1]);
  if (port < 1 || port > 65535) return null;
  return { port, sandboxId: match[2] };
}

// In-process relay token store for cross-domain proxy cookie hand-off.
// Uses globalThis so the Map is shared between server.ts (dynamic import) and
// Next.js API routes (webpack bundle) running in the same Node.js process.
const _relayStore = (): Map<string, { fastgptToken: string; exp: number }> => {
  const g = globalThis as any;
  if (!g.__proxyRelayStore) g.__proxyRelayStore = new Map();
  return g.__proxyRelayStore;
};

// Create a one-time relay token (60 s TTL).
// The token is an opaque nonce; the actual fastgptToken is stored server-side.
export function createRelayToken(fastgptToken: string): string {
  const store = _relayStore();
  const nonce = randomBytes(16).toString('hex');
  store.set(nonce, { fastgptToken, exp: Date.now() + 60_000 });
  // Prune expired entries on each write
  for (const [k, v] of store) if (v.exp < Date.now()) store.delete(k);
  return nonce;
}

// Redeem a relay token (one-time use). Returns fastgptToken or null if not found / expired.
export function redeemRelayToken(nonce: string): string | null {
  const store = _relayStore();
  const entry = store.get(nonce);
  if (!entry || entry.exp < Date.now()) {
    store.delete(nonce);
    return null;
  }
  store.delete(nonce);
  return entry.fastgptToken;
}

// Proxy session store — keyed by sandboxId.
// Populated on first cookie-authenticated request so that subsequent requests
// from a sandboxed iframe (opaque origin, no cookies) are still authorised.
// TTL is refreshed on every access; idle sessions expire after 2 hours.
const PROXY_SESSION_TTL = 2 * 60 * 60 * 1000;
const MAX_SESSION_STORE_SIZE = 1000;

type ProxySession = {
  teamId: string;
  host: string;
  protocol: string;
  exp: number;
};

const _sessionStore = (): Map<string, ProxySession> => {
  const g = globalThis as any;
  if (!g.__proxySessionStore) g.__proxySessionStore = new Map();
  return g.__proxySessionStore;
};

export function upsertProxySession(
  sandboxId: string,
  teamId: string,
  host: string,
  protocol: string
): void {
  const store = _sessionStore();
  // Enforce capacity cap: evict the soonest-to-expire entry before adding a new one
  if (!store.has(sandboxId) && store.size >= MAX_SESSION_STORE_SIZE) {
    let evictKey: string | null = null;
    let minExp = Infinity;
    for (const [k, v] of store) {
      if (v.exp < minExp) {
        minExp = v.exp;
        evictKey = k;
      }
    }
    if (evictKey) store.delete(evictKey);
  }
  store.set(sandboxId, { teamId, host, protocol, exp: Date.now() + PROXY_SESSION_TTL });
  // Prune expired entries on each write
  for (const [k, v] of store) if (v.exp < Date.now()) store.delete(k);
}

// Returns the session if active, refreshing its TTL; returns null if absent/expired.
export function getProxySession(sandboxId: string): ProxySession | null {
  const store = _sessionStore();
  const s = store.get(sandboxId);
  if (!s || s.exp < Date.now()) {
    store.delete(sandboxId);
    return null;
  }
  s.exp = Date.now() + PROXY_SESSION_TTL;
  return s;
}

export function deleteProxySession(sandboxId: string): void {
  _sessionStore().delete(sandboxId);
  deleteCsSession(sandboxId);
}

// Remove all proxy sessions belonging to a given team.
// Called on user logout to prevent stale sessions from surviving after sign-out.
export function deleteProxySessionsByTeam(teamId: string): void {
  const store = _sessionStore();
  for (const [k, v] of store) {
    if (v.teamId === teamId) {
      store.delete(k);
      deleteCsSession(k);
    }
  }
}

// ---- code-server session store ----
// Keyed by sandboxId; stores the `key` cookie value returned by code-server /login.
// TTL matches ProxySession so both expire around the same time.
const CS_SESSION_TTL = 2 * 60 * 60 * 1000; // 2 h
const MAX_CS_SESSION_STORE_SIZE = 1000;

type CsSession = { keyCookie: string; exp: number };

const _csStore = (): Map<string, CsSession> => {
  const g = globalThis as any;
  if (!g.__csSessionStore) g.__csSessionStore = new Map();
  return g.__csSessionStore;
};

export function getCsSession(sandboxId: string): string | null {
  const entry = _csStore().get(sandboxId);
  if (!entry || entry.exp < Date.now()) {
    _csStore().delete(sandboxId);
    return null;
  }
  entry.exp = Date.now() + CS_SESSION_TTL;
  return entry.keyCookie;
}

export function deleteCsSession(sandboxId: string): void {
  _csStore().delete(sandboxId);
}

/**
 * Ensure a valid code-server session exists for the given sandbox.
 * Checks the in-process cache first; on miss invokes getPassword() and POSTs /login.
 * Returns the `key` cookie value on success, or null on failure.
 */
export async function ensureCodeServerSession(
  sandboxId: string,
  target: string, // e.g. "http://10.0.0.5:8080"
  getPassword: () => Promise<string | null>
): Promise<string | null> {
  const cached = getCsSession(sandboxId);
  if (cached) return cached;

  const password = await getPassword();
  if (!password) return null;

  let resp: Response;
  try {
    resp = await fetch(`${target}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        origin: new URL(target).origin // scheme://host:port only, no path component
      },
      body: `password=${encodeURIComponent(password)}`,
      redirect: 'manual' // success → 302; wrong password → 200
    });
  } catch (e) {
    console.error(`[csLogin] fetch error sandboxId=${sandboxId}: ${(e as Error).message}`);
    return null;
  }

  if (resp.status !== 302 && resp.status !== 301) {
    console.warn(`[csLogin] unexpected status=${resp.status} sandboxId=${sandboxId}`);
    return null;
  }

  // Extract key=<value> from Set-Cookie header(s)
  const setCookies: string[] = (resp.headers as any).getSetCookie?.() ?? [
    resp.headers.get('set-cookie') ?? ''
  ];
  let keyCookie: string | null = null;
  for (const h of setCookies) {
    const m = (h as string).match(/(?:^|;\s*)code-server-session=([^;]+)/i);
    if (m) {
      keyCookie = m[1].trim();
      break;
    }
  }

  if (!keyCookie) {
    console.warn(`[csLogin] no key cookie in response sandboxId=${sandboxId}`);
    return null;
  }

  const csStore = _csStore();
  // Enforce capacity cap: evict the soonest-to-expire entry before adding a new one
  if (!csStore.has(sandboxId) && csStore.size >= MAX_CS_SESSION_STORE_SIZE) {
    let evictKey: string | null = null;
    let minExp = Infinity;
    for (const [k, v] of csStore) {
      if (v.exp < minExp) {
        minExp = v.exp;
        evictKey = k;
      }
    }
    if (evictKey) csStore.delete(evictKey);
  }
  csStore.set(sandboxId, { keyCookie, exp: Date.now() + CS_SESSION_TTL });
  // Prune expired entries on each write
  for (const [k, v] of csStore) if (v.exp < Date.now()) csStore.delete(k);
  return keyCookie;
}

// Rewrite absolute paths in HTML for the absproxy mode
export function rewriteHtml(html: string, basePath: string): string {
  return (
    html
      // Rewrite src/href/action attributes pointing to absolute paths (not protocol-relative)
      .replace(/((?:src|href|action)=["'])(\/(?!\/))/g, `$1${basePath}/`)
      // Rewrite url() in CSS with absolute paths
      .replace(/(url\(['"]?)(\/(?!\/))/g, `$1${basePath}/`)
      // Inject <base> tag last to avoid self-rewrite by the replacements above
      .replace(/(<head[^>]*>)/i, `$1<base href="${basePath}/">`)
  );
}
