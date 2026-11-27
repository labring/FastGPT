import { NextAPI } from '@/service/middleware/entry';
import type { NextApiRequest, NextApiResponse } from 'next';
import { sseErrRes } from '@fastgpt/service/common/response';
import { responseWrite } from '@fastgpt/service/common/response';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  getSkillEditRuntimeContext,
  initSkillEditRuntimeSandbox
} from '@fastgpt/service/core/ai/sandbox/application/skillEdit/runtime';
import { SkillRuntimeBodySchema } from '@fastgpt/global/openapi/core/ai/skill/api';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';
import { isValidObjectId } from 'mongoose';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { UserError } from '@fastgpt/global/common/error/utils';
import { AgentSkillCreationStatusEnum } from '@fastgpt/global/core/ai/skill/constants';
import {
  ApiRequestInputParseError,
  parseApiInput
} from '@fastgpt/service/common/zod/requestParseError';

/**
 * 初始化 Skill Edit runtime sandbox。
 *
 * 自动处理冷恢复、同 PVC 静默换镜像及激活就绪；未迁移存量实例会在 context 构造阶段抛出 409。
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const { skillId } = parseApiInput({
      req,
      bodySchema: SkillRuntimeBodySchema
    }).body;

    if (!isValidObjectId(skillId)) {
      sseErrRes(res, SkillErrEnum.invalidSkillId);
      res.end();
      return;
    }

    const { teamId, skill } = await authSkill({
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

    const onProgress = (status: SandboxStatusItemType) => {
      responseWrite({
        res,
        event: SseResponseEventEnum.sandboxStatus,
        data: JSON.stringify(status)
      });
    };

    const context = await getSkillEditRuntimeContext({
      skillId,
      teamId
    });

    await initSkillEditRuntimeSandbox({
      context,
      onProgress
    });

    res.end();
  } catch (error) {
    const responseError =
      error instanceof UserError || error instanceof ApiRequestInputParseError
        ? error
        : new Error('Failed to initialize skill runtime', { cause: error });
    sseErrRes(res, responseError);
    res.end();
  }
}

export default NextAPI(handler);
