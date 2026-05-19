import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { serviceEnv } from '@fastgpt/service/env';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { getSandboxProviderConfig } from '@fastgpt/service/core/ai/sandbox/config';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import {
  SandboxHeartbeatBodySchema,
  SandboxHeartbeatResponseSchema,
  type SandboxHeartbeatResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';

/**
 * Internal-only endpoint called by sandbox-proxy while a code-server websocket is alive.
 * Authenticated with SANDBOX_PROXY_SECRET so it does not depend on browser timers or user cookies.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<SandboxHeartbeatResponse | void> {
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

  const parsed = SandboxHeartbeatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid body', issues: parsed.error.issues });
  }
  const { sandboxId } = parsed.data;
  const providerConfig = getSandboxProviderConfig();

  const result = await MongoSandboxInstance.updateOne(
    {
      provider: providerConfig.provider,
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

  return SandboxHeartbeatResponseSchema.parse({ success: true });
}

export default NextAPI(handler);
