import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { getCodeServerPasswordFromSandbox } from '@/service/core/sandbox/proxy';

// Internal-only endpoint: read the code-server password from the container config.yaml.
// Called by server.ts (running in the same process) to avoid importing service packages directly.
// Only requests from 127.0.0.1 are accepted.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const clientIp = req.socket.remoteAddress;

  if (clientIp !== '127.0.0.1' && clientIp !== '::1' && clientIp !== '::ffff:127.0.0.1') {
    return res.status(403).json({ error: 'Internal only' });
  }

  const { sandboxId } = req.body as { sandboxId?: string };
  if (!sandboxId) return res.status(400).json({ error: 'Missing sandboxId' });

  const password = await getCodeServerPasswordFromSandbox(sandboxId);
  return res.json({ password });
}

export default NextAPI(handler);
