import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import {
  setAgentRuntimeStop,
  waitForWorkflowComplete
} from '@fastgpt/service/core/workflow/dispatch/workflowStatus';
import {
  StopV2ChatSchema,
  type StopV2ChatResponse
} from '@fastgpt/global/openapi/core/chat/controler/api';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { authSkillByTmbId } from '@fastgpt/service/support/permission/agentSkill/auth';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: NextApiRequest, _res: NextApiResponse): Promise<StopV2ChatResponse> {
  const { appId, chatId, outLinkAuthData } = StopV2ChatSchema.parse(req.body);

  try {
    await authChatCrud({
      req,
      authToken: true,
      authApiKey: true,
      appId,
      chatId,
      ...outLinkAuthData
    });
  } catch (err: any) {
    // Fallback: appId may be a skillId (e.g. Skill Preview debug chat).
    // authChatCrud → authApp fails with AppErrEnum.unExist when appId is not a real app.
    const errCode = err?.message || err?.statusText || err;
    if (errCode !== AppErrEnum.unExist) {
      throw err;
    }

    const { tmbId } = await parseHeaderCert({ req, authToken: true, authApiKey: true });
    await authSkillByTmbId({
      tmbId,
      skillId: appId,
      per: ReadPermissionVal
    });
  }

  // 设置停止状态
  await setAgentRuntimeStop({
    appId,
    chatId
  });

  // 等待工作流完成 (最多等待 5 秒)
  await waitForWorkflowComplete({ appId, chatId, timeout: 5000 });

  return {
    success: true
  };
}

export default NextAPI(handler);
