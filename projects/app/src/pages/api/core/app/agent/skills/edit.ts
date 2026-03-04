import type { NextApiRequest, NextApiResponse } from 'next';
import { sseErrRes } from '@fastgpt/service/common/response';
import { responseWrite } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { createEditDebugSandbox } from '@fastgpt/service/core/agentSkill/sandboxController';
import type { CreateEditDebugSandboxBody } from '@fastgpt/global/core/agentSkill/api';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';

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
      sseErrRes(res, new Error('skillId is required'));
      res.end();
      return;
    }

    // Validate optional parameters
    if (image && !image.repository) {
      sseErrRes(res, new Error('image.repository is required when image is provided'));
      res.end();
      return;
    }

    if (timeout !== undefined && (typeof timeout !== 'number' || timeout <= 0)) {
      sseErrRes(res, new Error('timeout must be a positive number'));
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
      timeout,
      onProgress
    });

    res.end();
  } catch (err: any) {
    console.error('[API] Create edit-debug sandbox error:', err);
    sseErrRes(res, err);
    res.end();
  }
}
