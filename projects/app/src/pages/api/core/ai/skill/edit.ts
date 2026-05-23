import type { NextApiRequest, NextApiResponse } from 'next';
import { sseErrRes } from '@fastgpt/service/common/response';
import { responseWrite } from '@fastgpt/service/common/response';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createEditDebugSandbox } from '@fastgpt/service/core/ai/skill/edit/sandbox';
import { CreateEditDebugSandboxBodySchema } from '@fastgpt/global/core/ai/skill/api';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';
import { isValidObjectId } from 'mongoose';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { AgentSkillCreationStatusEnum } from '@fastgpt/global/core/ai/skill/constants';
import {
  getZodParseErrorInputSource,
  parseApiInput
} from '@fastgpt/service/common/zod/requestParseError';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS);

/**
 * Create an edit-debug sandbox for a skill.
 * Returns an SSE stream with sandboxStatus events; the final 'ready' event contains sandboxId/status.
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
    const { skillId, image } = parseApiInput({
      req,
      bodySchema: CreateEditDebugSandboxBodySchema
    }).body;

    if (!isValidObjectId(skillId)) {
      sseErrRes(res, SkillErrEnum.invalidSkillId);
      res.end();
      return;
    }

    // Authenticate user and verify write permission
    const { teamId, tmbId, skill } = await authSkill({
      req,
      authToken: true,
      authApiKey: true,
      skillId,
      per: WritePermissionVal
    });

    if (skill.creationStatus !== AgentSkillCreationStatusEnum.ready || !skill.currentVersionId) {
      sseErrRes(res, skill.creationError || SkillErrEnum.noStorage);
      res.end();
      return;
    }

    // Validate optional parameters
    if (image && !image.repository) {
      sseErrRes(res, SkillErrEnum.missingImageRepository);
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
  } catch (error) {
    logger.error('Failed to create edit-debug sandbox', { error });
    // 请求参数错误是 API 边界可预期错误；运行时异常仍统一隐藏实现细节。
    sseErrRes(
      res,
      getZodParseErrorInputSource(error) ? error : new Error('Failed to create sandbox')
    );
    res.end();
  }
}
