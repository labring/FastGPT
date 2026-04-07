import type { NextApiRequest, NextApiResponse } from 'next';
import { sseErrRes } from '@fastgpt/service/common/response';
import { responseWrite } from '@fastgpt/service/common/response';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createEditDebugSandbox } from '@fastgpt/service/core/agentSkills/sandboxController';
import type { CreateEditDebugSandboxBody } from '@fastgpt/global/core/agentSkills/api';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';
import { isValidObjectId } from 'mongoose';

/**
 * Create an edit-debug sandbox for a skill.
 * Returns an SSE stream with sandboxStatus events; the final 'ready' event contains endpoint info.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only POST method allowed
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Set SSE headers before any response is written
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    // Parse request body
    const { skillId, image } = req.body as CreateEditDebugSandboxBody;

    // Validate required parameters
    if (!skillId) {
      sseErrRes(res, new Error('skillId is required'));
      res.end();
      return;
    }

    if (!isValidObjectId(skillId)) {
      sseErrRes(res, new Error('Invalid skill ID format'));
      res.end();
      return;
    }

    // Authenticate user and verify write permission
    const { teamId, tmbId } = await authSkill({
      req,
      authToken: true,
      authApiKey: true,
      skillId,
      per: WritePermissionVal
    });

    // Validate optional parameters
    if (image && !image.repository) {
      sseErrRes(res, new Error('image.repository is required when image is provided'));
      res.end();
      return;
    }

    // Build onProgress callback: each phase emits a sandboxStatus SSE event
    const onProgress = (status: SandboxStatusItemType) => {
      responseWrite({
        res,
        event: SseResponseEventEnum.sandboxStatus,
        data: JSON.stringify(status)
      });
    };

    // Create sandbox; 'ready' phase in onProgress carries the endpoint result
    await createEditDebugSandbox({
      skillId,
      teamId,
      tmbId,
      image,
      onProgress
    });

    res.end();
  } catch (err: any) {
    console.error('[API] Create edit-debug sandbox error:', err);
    // Wrap to avoid leaking internal implementation details via SSE
    sseErrRes(res, new Error('Failed to create sandbox'));
    res.end();
  }
}
