import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { createEditDebugSandbox } from '@fastgpt/service/core/agentSkill/sandboxController';
import type {
  CreateEditDebugSandboxBody,
  CreateEditDebugSandboxResponse
} from '@fastgpt/global/core/agentSkill/api';

/**
 * POST /api/core/app/agent/skills/sandbox/edit
 *
 * Create an edit-debug sandbox for a skill
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
    const { teamId, tmbId } = await authUserPer({
      req,
      authToken: true,
      authApiKey: true
    });

    // Parse request body
    const { skillId, image, timeout } = req.body as CreateEditDebugSandboxBody;

    // Validate required parameters
    if (!skillId) {
      return jsonRes(res, {
        code: 400,
        error: 'skillId is required'
      });
    }

    // Validate optional parameters
    if (image) {
      if (!image.repository) {
        return jsonRes(res, {
          code: 400,
          error: 'image.repository is required when image is provided'
        });
      }
    }

    if (timeout !== undefined && (typeof timeout !== 'number' || timeout <= 0)) {
      return jsonRes(res, {
        code: 400,
        error: 'timeout must be a positive number'
      });
    }

    // Create sandbox
    const result = await createEditDebugSandbox({
      skillId,
      teamId,
      tmbId,
      image,
      timeout
    });

    // Format response
    const response: CreateEditDebugSandboxResponse = {
      sandboxId: result.sandboxId,
      providerSandboxId: result.providerSandboxId,
      endpoint: result.endpoint,
      status: result.status,
      expiresAt: result.expiresAt?.toISOString()
    };

    jsonRes<CreateEditDebugSandboxResponse>(res, {
      data: response
    });
  } catch (err: any) {
    console.error('[API] Create edit-debug sandbox error:', err);

    // Handle specific error types
    if (err.message?.includes('not found')) {
      return jsonRes(res, {
        code: 404,
        error: err.message || 'Resource not found'
      });
    }

    if (err.message?.includes('access denied') || err.message?.includes('permission')) {
      return jsonRes(res, {
        code: 403,
        error: err.message || 'Access denied'
      });
    }

    // Generic error
    jsonRes(res, {
      code: 500,
      error: err.message || 'Failed to create sandbox'
    });
  }
}
