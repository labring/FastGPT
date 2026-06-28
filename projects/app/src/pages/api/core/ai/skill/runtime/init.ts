import type { NextApiRequest, NextApiResponse } from 'next';
import { sseErrRes } from '@fastgpt/service/common/response';
import { responseWrite } from '@fastgpt/service/common/response';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  getSkillEditRuntimeContext,
  getSkillEditRuntimeStatus,
  initSkillEditRuntimeSandbox
} from '@fastgpt/service/core/ai/sandbox/interface/skillEdit';
import { SkillRuntimeBodySchema } from '@fastgpt/global/core/ai/skill/api';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';
import { isValidObjectId } from 'mongoose';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { UserError } from '@fastgpt/global/common/error/utils';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { AgentSkillCreationStatusEnum } from '@fastgpt/global/core/ai/skill/constants';
import {
  getZodParseErrorInputSource,
  parseApiInput
} from '@fastgpt/service/common/zod/requestParseError';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS);

/**
 * 初始化 Skill Edit runtime sandbox。
 *
 * 该接口只负责启动、恢复或复用沙盒；runtime 升级判断和触发由 getStatus/upgrade 承担。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

    const onProgress = (status: SandboxStatusItemType) => {
      responseWrite({
        res,
        event: SseResponseEventEnum.sandboxStatus,
        data: JSON.stringify(status)
      });
    };

    const context = await getSkillEditRuntimeContext({
      skillId,
      teamId,
      tmbId
    });
    const status = await getSkillEditRuntimeStatus({ context });

    if (status.status !== 'readyToInit') {
      const errorMessage =
        status.status === 'upgrading'
          ? SandboxErrEnum.runtimeUpgradeInProgress
          : status.lastError || SandboxErrEnum.runtimeUpgradeFailed;
      throw new UserError(errorMessage);
    }

    await initSkillEditRuntimeSandbox({
      context,
      onProgress
    });

    res.end();
  } catch (error) {
    logger.error('Failed to initialize skill edit runtime', { error });
    const responseError =
      getZodParseErrorInputSource(error) ||
      (error instanceof UserError ? error : new Error('Failed to initialize skill runtime'));
    sseErrRes(res, responseError);
    res.end();
  }
}
