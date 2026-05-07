import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { NextAPI } from '@/service/middleware/entry';
import { serviceEnv } from '@fastgpt/service/env';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';

const BodySchema = z.object({
  sandboxId: z.string().min(1)
});

/**
 * Internal-only endpoint called by sandbox-proxy while a code-server websocket is alive.
 * Authenticated with SANDBOX_PROXY_SECRET so it does not depend on browser timers or user cookies.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expected = serviceEnv.SANDBOX_PROXY_SECRET;
  if (!expected) {
    return res.status(503).json({ error: 'SANDBOX_PROXY_SECRET not configured' });
  }
  if (req.headers.authorization !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid body', issues: parsed.error.issues });
  }
  const { sandboxId } = parsed.data;

  const result = await MongoSandboxInstance.updateOne(
    {
      sandboxId,
      status: SandboxStatusEnum.running
    },
    {
      $set: {
        lastActiveAt: new Date()
      }
    }
  );

  if (result.matchedCount === 0) {
    return res.status(404).json({ error: 'Sandbox not found or not running' });
  }

  return res.json({ success: true });
}

export default NextAPI(handler);
