import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { deleteSandbox } from '@fastgpt/service/core/agentSkill/sandboxController';
import type { DeleteSandboxBody, DeleteSandboxResponse } from '@fastgpt/global/core/agentSkill/api';

/**
 * DELETE /api/core/app/agent/skills/sandbox/delete
 *
 * Delete a sandbox
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Only DELETE method allowed
    if (req.method !== 'DELETE') {
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
    const { sandboxId } = req.body as DeleteSandboxBody;

    // Validate sandboxId
    if (!sandboxId) {
      return jsonRes(res, {
        code: 400,
        error: 'sandboxId is required'
      });
    }

    // Delete sandbox
    await deleteSandbox({
      sandboxId,
      teamId
    });

    jsonRes<DeleteSandboxResponse>(res, {
      data: undefined
    });
  } catch (err: any) {
    console.error('[API] Delete sandbox error:', err);

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
      error: err.message || 'Failed to delete sandbox'
    });
  }
}
