import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getSandboxProviderConfig } from '@fastgpt/service/core/ai/sandbox/config';
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
  const body = parseApiInput({ req, bodySchema: SandboxCheckExistBodySchema }).body;
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

  // 检查沙盒是否存在
  const providerConfig = getSandboxProviderConfig();
  const sandboxInstance = await MongoSandboxInstance.findOne(
    {
      provider: providerConfig.provider,
      appId,
      userId: uid,
      chatId
    },
    '_id'
  ).lean();

  return {
    exists: !!sandboxInstance
  };
}

export default NextAPI(handler);
