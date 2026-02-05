import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { renewSandboxExpiration } from '@fastgpt/service/core/agentSkill/sandboxController';
import type { RenewSandboxBody, RenewSandboxResponse } from '@fastgpt/global/core/agentSkill/api';

/**
 * POST /api/core/app/agent/skills/sandbox/renew
 *
 * Renew sandbox expiration
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Only POST method allowed
    if (req.method !== 'POST') {
      return jsonRes(res, {
        code: 405,
        error: 'Method not allowed'
      });
    }

    // Authenticate user
    const { teamId } = await authUserPer({
      req,
      authToken: true,
      authApiKey: true
    });

    // Parse request body
    const { sandboxId, additionalSeconds } = req.body as RenewSandboxBody;

    // Validate sandboxId
    if (!sandboxId) {
      return jsonRes(res, {
        code: 400,
        error: 'sandboxId is required'
      });
    }

    // Validate additionalSeconds if provided
    if (
      additionalSeconds !== undefined &&
      (typeof additionalSeconds !== 'number' || additionalSeconds <= 0)
    ) {
      return jsonRes(res, {
        code: 400,
        error: 'additionalSeconds must be a positive number'
      });
    }

    // Renew sandbox
    const expiresAt = await renewSandboxExpiration({
      sandboxId,
      teamId,
      additionalSeconds
    });

    // Format response
    const response: RenewSandboxResponse = {
      expiresAt: expiresAt?.toISOString()
    };

    jsonRes<RenewSandboxResponse>(res, {
      data: response
    });
  } catch (err: any) {
    console.error('[API] Renew sandbox error:', err);

    if (err.message?.includes('not found')) {
      return jsonRes(res, {
        code: 404,
        error: err.message || 'Sandbox not found'
      });
    }

    if (err.message?.includes('access denied')) {
      return jsonRes(res, {
        code: 403,
        error: err.message || 'Access denied'
      });
    }

    jsonRes(res, {
      code: 500,
      error: err.message || 'Failed to renew sandbox'
    });
  }
}
