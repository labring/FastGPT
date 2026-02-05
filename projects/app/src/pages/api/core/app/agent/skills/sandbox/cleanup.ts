import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { runCleanupNow } from '@fastgpt/service/core/agentSkill/sandboxCleanup';

/**
 * POST /api/core/app/agent/skills/sandbox/cleanup
 *
 * Manually trigger sandbox cleanup (admin only)
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

    // Authenticate user (should check for admin role in production)
    await authUserPer({
      req,
      authToken: true,
      authApiKey: true
    });

    // TODO: Add admin role check
    // if (!user.isAdmin) {
    //   return jsonRes(res, {
    //     code: 403,
    //     error: 'Admin access required'
    //   });
    // }

    // Run cleanup
    const result = await runCleanupNow();

    jsonRes(res, {
      data: {
        message: 'Cleanup completed',
        inactive: result.inactive,
        expired: result.expired,
        totalCleaned: result.inactive.succeeded + result.expired.succeeded,
        totalFailed: result.inactive.failed + result.expired.failed
      }
    });
  } catch (err: any) {
    console.error('[API] Manual cleanup error:', err);

    jsonRes(res, {
      code: 500,
      error: err.message || 'Failed to run cleanup'
    });
  }
}
