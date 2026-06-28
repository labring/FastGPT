import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import {
  authSandboxSession,
  buildSandboxClientQueryFromChatSource
} from '@/service/core/sandbox/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  SandboxCheckExistBodySchema,
  type SandboxCheckExistResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { checkSandboxSessionExist } from '@fastgpt/service/core/ai/sandbox/interface/session';

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

  const {
    uid,
    sourceType: resolvedSourceType,
    sourceId: resolvedSourceId
  } = await authSandboxSession({
    req,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData
  });

  const sandboxQuery = buildSandboxClientQueryFromChatSource({
    sourceType: resolvedSourceType,
    sourceId: resolvedSourceId,
    userId: uid,
    chatId
  });

  return {
    exists: await checkSandboxSessionExist(sandboxQuery)
  };
}

export default NextAPI(handler);
