import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getSandboxInfo } from '@fastgpt/service/core/agentSkill/sandboxController';
import type {
  GetSandboxInfoQuery,
  GetSandboxInfoResponse
} from '@fastgpt/global/core/agentSkill/api';

/**
 * GET /api/core/app/agent/skills/sandbox/info
 *
 * Get sandbox information
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Only GET method allowed
    if (req.method !== 'GET') {
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

    // Get query parameters
    const { sandboxId } = req.query as unknown as GetSandboxInfoQuery;

    // Validate sandboxId
    if (!sandboxId) {
      return jsonRes(res, {
        code: 400,
        error: 'sandboxId is required'
      });
    }

    // Get sandbox info
    const sandbox = await getSandboxInfo({
      sandboxId,
      teamId
    });

    // Format response
    const response: GetSandboxInfoResponse = {
      sandboxId: sandbox._id,
      skillId: sandbox.skillId,
      sandboxType: sandbox.sandboxType,
      providerSandboxId: sandbox.sandbox.sandboxId,
      endpoint: sandbox.endpoint,
      status: {
        state: sandbox.sandbox.status.state,
        message: sandbox.sandbox.status.message
      },
      createTime: sandbox.createTime?.toISOString() || new Date().toISOString(),
      lastActivityTime: sandbox.lastActivityTime?.toISOString() || new Date().toISOString(),
      expiresAt: sandbox.sandbox.expiresAt?.toISOString()
    };

    jsonRes<GetSandboxInfoResponse>(res, {
      data: response
    });
  } catch (err: any) {
    console.error('[API] Get sandbox info error:', err);

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
      error: err.message || 'Failed to get sandbox info'
    });
  }
}
