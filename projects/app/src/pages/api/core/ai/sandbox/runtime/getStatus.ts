import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  SandboxRuntimeStatusResponseSchema,
  type SandboxRuntimeStatusResponse
} from '@fastgpt/global/core/ai/sandbox/type';
import {
  SandboxRuntimeBodySchema,
  type SandboxRuntimeRuntimeBody
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getAppSandboxRuntimeStatus } from '@fastgpt/service/core/ai/sandbox/interface/runtime';
import {
  authSandboxSession,
  buildSandboxClientQueryFromChatSource
} from '@/service/core/sandbox/auth';

async function handler(req: ApiRequestProps): Promise<SandboxRuntimeStatusResponse> {
  const { sourceType, sourceId, chatId, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: SandboxRuntimeBodySchema
  }).body satisfies SandboxRuntimeRuntimeBody;

  if (sourceType !== ChatSourceTypeEnum.app) {
    throw new Error('Only App sandbox runtime supports chat upgrade status');
  }

  const authResult = await authSandboxSession({
    req,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData
  });
  const query = buildSandboxClientQueryFromChatSource({
    sourceType: authResult.sourceType,
    sourceId: authResult.sourceId,
    userId: authResult.uid,
    chatId
  });
  return SandboxRuntimeStatusResponseSchema.parse(await getAppSandboxRuntimeStatus(query));
}

export default NextAPI(handler);
