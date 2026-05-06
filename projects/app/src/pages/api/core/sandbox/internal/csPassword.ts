import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { getCodeServerPasswordFromSandbox } from '@/service/core/sandbox/proxy';
import { env } from '@fastgpt/service/env';

/**
 * Internal-only endpoint called by sandbox-proxy when its code-server cookie cache
 * misses. Authenticated via a bearer header carrying the shared SANDBOX_PROXY_SECRET.
 *
 * Keeping the password OUT of the JWT (where it would be base64-decodable in any leak)
 * costs us one HTTP roundtrip per (sandboxId × proxy-process) — the result is cached
 * in proxy memory as a code-server `key` cookie, so it's amortised across the session.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expected = env.SANDBOX_PROXY_SECRET;
  if (!expected) {
    return res.status(503).json({ error: 'SANDBOX_PROXY_SECRET not configured' });
  }
  if (req.headers.authorization !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { sandboxId } = (req.body || {}) as { sandboxId?: string };
  if (!sandboxId || typeof sandboxId !== 'string') {
    return res.status(400).json({ error: 'Missing sandboxId' });
  }

  const password = await getCodeServerPasswordFromSandbox(sandboxId).catch(() => null);
  return res.json({ password });
}

export default NextAPI(handler);
