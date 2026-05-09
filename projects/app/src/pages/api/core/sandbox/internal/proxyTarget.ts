import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { getSandboxProxyTarget } from '@/service/core/sandbox/proxy';
import { serviceEnv } from '@fastgpt/service/env';
import {
  SandboxProxyTargetBodySchema,
  SandboxProxyTargetResponseSchema
} from '@fastgpt/global/openapi/core/ai/sandbox/api';

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

  const { sandboxId, service } = SandboxProxyTargetBodySchema.parse(req.body);
  const target = await getSandboxProxyTarget(sandboxId);
  if (target.service !== service) {
    return res.status(404).json({ error: 'Sandbox proxy service not found' });
  }

  return res.json(
    SandboxProxyTargetResponseSchema.parse({
      service: target.service,
      origin: target.origin,
      basePath: target.basePath,
      auth: target.auth,
      password: target.password
    })
  );
}

export default NextAPI(handler);
