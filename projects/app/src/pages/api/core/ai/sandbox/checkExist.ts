import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import {
  authSandboxSession,
  buildSandboxClientQueryFromChatSource
} from '@/service/core/sandbox/auth';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/instance/schema';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getSandboxProviderConfig } from '@fastgpt/service/core/ai/sandbox/provider/config';
import {
  SandboxCheckExistBodySchema,
  type SandboxCheckExistResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';

async function handler(req: ApiRequestProps): Promise<SandboxCheckExistResponse> {
  if (!global.feConfigs?.show_agent_sandbox) {
    return {
      exists: false
    };
  }

  // 解析请求体
  const { sourceType, sourceId, chatId, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: SandboxCheckExistBodySchema
  }).body;

  const { uid } = await authSandboxSession({
    req,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData
  });

  const providerConfig = getSandboxProviderConfig();
  const sandboxQuery = buildSandboxClientQueryFromChatSource({
    sourceType,
    sourceId,
    userId: uid,
    chatId
  });
  const sandboxInstance = await MongoSandboxInstance.findOne(
    {
      provider: providerConfig.provider,
      sandboxId: sandboxQuery.sandboxId
    },
    '_id'
  ).lean();

  return {
    exists: !!sandboxInstance
  };
}

export default NextAPI(handler);
