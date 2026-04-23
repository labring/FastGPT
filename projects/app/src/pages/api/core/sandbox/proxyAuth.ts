import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { getSandboxProxyTarget } from '@/service/core/sandbox/proxy';
import { createRelayToken } from '@/service/core/sandbox/proxyUtils';

const dev = process.env.NODE_ENV !== 'production';
// Internal proxy auth endpoint called by server.ts before forwarding to sandbox.
// POST: returns { target } so server.ts can proxy without importing service packages.
// GET:  cross-domain cookie hand-off — validates session, stores a relay token,
//       then redirects to the subdomain with ?__pt=<nonce> so the subdomain
//       can set the cookie itself (Chrome does not share Domain=.localhost cookies).
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return handleAuthRedirectGet(req, res);
  }

  const { sandboxId, targetPort } = req.body as { sandboxId: string; targetPort: number };

  if (!sandboxId || !targetPort) {
    return Promise.reject('Missing sandboxId or targetPort');
  }

  const { target, teamId } = await getSandboxProxyTarget(
    req.headers,
    sandboxId,
    Number(targetPort)
  );
  return res.json({ target, teamId });
}

// GET handler: redirect flow for subdomain cookie hand-off.
// Flow:
//   1. server.ts redirects unauthenticated subdomain request here (on the base origin).
//   2. This handler validates the main session (cookie is available on the base origin).
//   3. Creates a one-time relay token storing fastgptToken in memory.
//   4. Redirects browser to {next}?__pt=<nonce> (on the subdomain).
//   5. server.ts intercepts ?__pt=, redeems the token, sets cookie scoped to the subdomain.
async function handleAuthRedirectGet(req: NextApiRequest, res: NextApiResponse) {
  const {
    sandboxId,
    port,
    next: nextUrl
  } = req.query as {
    sandboxId?: string;
    port?: string;
    next?: string;
  };

  if (!sandboxId || !port || !nextUrl) {
    res.statusCode = 400;
    res.end('Missing parameters');
    return;
  }

  // Validate next is a safe URL: must be http(s) and hostname must be the base host or a subdomain
  let parsedNext: URL;
  try {
    parsedNext = new URL(nextUrl);
    if (parsedNext.protocol !== 'http:' && parsedNext.protocol !== 'https:') {
      throw new Error('disallowed protocol');
    }
  } catch {
    res.statusCode = 400;
    res.end('Invalid next URL');
    return;
  }

  // Only allow redirects to the same host or its subdomains to prevent open redirect
  const baseHostname = (req.headers.host || '').split(':')[0];
  const nextHostname = parsedNext.hostname;
  if (baseHostname && nextHostname !== baseHostname && !nextHostname.endsWith(`.${baseHostname}`)) {
    res.statusCode = 400;
    res.end('Invalid next URL: hostname not allowed');
    return;
  }

  // Validate sandbox ownership (throws → NextAPI returns JSON error if auth fails)
  await getSandboxProxyTarget(req.headers, sandboxId, Number(port));

  // Extract fastgpt_token from the main-origin cookie
  const fastgptToken = extractCookieValue(req.headers.cookie, 'fastgpt_token');
  if (!fastgptToken) {
    res.statusCode = 401;
    res.end('No fastgpt_token cookie found');
    return;
  }

  // Store the token server-side and give the browser an opaque nonce in the URL.
  // The subdomain will redeem this nonce and set its own scoped cookie.
  const relayToken = createRelayToken(fastgptToken);
  parsedNext.searchParams.set('__pt', relayToken);

  dev && console.log(`[proxy:auth] relay token created, redirecting to subdomain next=${nextUrl}`);
  res.redirect(302, parsedNext.toString());
}

// Parse a named cookie value from a raw Cookie header string.
function extractCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx < 0) continue;
    if (part.substring(0, eqIdx).trim() === name) {
      return part.substring(eqIdx + 1).trim();
    }
  }
  return undefined;
}

export default NextAPI(handler);
