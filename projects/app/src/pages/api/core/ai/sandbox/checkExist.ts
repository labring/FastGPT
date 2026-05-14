import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import {
  SandboxCheckExistBodySchema,
  type SandboxCheckExistResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';

async function handler(
  req: ApiRequestProps,
  res: NextApiResponse<SandboxCheckExistResponse>
): Promise<SandboxCheckExistResponse> {
  if (!global.feConfigs?.show_agent_sandbox) {
    return {
      exists: false
    };
  }

  // 解析请求体
  const body = SandboxCheckExistBodySchema.parse(req.body);
  const { appId, chatId, outLinkAuthData } = body;

  // 统一鉴权
  const { uid } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    chatId,
    ...outLinkAuthData
  });

  // Check for both generic sandbox (by appId/userId/chatId) and sessionRuntime sandbox (by chatId)
  const sandboxInstance = await MongoSandboxInstance.findOne(
    {
      $or: [
        { appId, userId: uid, chatId },
        { chatId, 'metadata.sandboxType': SandboxTypeEnum.sessionRuntime }
      ]
    },
    '_id'
  ).lean();

  return {
    exists: !!sandboxInstance
  };
}

export default NextAPI(handler);
