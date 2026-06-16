import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authSandboxSession } from '@/service/core/sandbox/auth';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/instance/schema';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getSandboxProviderConfig } from '@fastgpt/service/core/ai/sandbox/provider/config';
import {
  SandboxCheckExistBodySchema,
  type SandboxCheckExistResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from '@fastgpt/service/core/ai/skill/edit/config';
import { SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';

async function handler(req: ApiRequestProps): Promise<SandboxCheckExistResponse> {
  if (!global.feConfigs?.show_agent_sandbox) {
    return {
      exists: false
    };
  }

  // 解析请求体
  const body = parseApiInput({ req, bodySchema: SandboxCheckExistBodySchema }).body;
  const { appId, chatId, outLinkAuthData } = body;

  const { uid } = await authSandboxSession({
    req,
    appId,
    chatId,
    outLinkAuthData
  });

  const providerConfig = getSandboxProviderConfig();
  const isEditDebug = chatId === EDIT_DEBUG_SANDBOX_CHAT_ID;
  const sandboxInstance = await MongoSandboxInstance.findOne(
    {
      provider: providerConfig.provider,
      appId,
      userId: isEditDebug ? '' : uid,
      chatId,
      ...(isEditDebug ? { type: SandboxTypeEnum.editDebug } : {})
    },
    '_id'
  ).lean();

  return {
    exists: !!sandboxInstance
  };
}

export default NextAPI(handler);
