import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { handleSkillDebugChat } from '@fastgpt/service/core/ai/skill/debugChat';
import {
  SkillDebugChatBodySchema,
  type SkillDebugChatBody
} from '@fastgpt/global/openapi/core/ai/skill/api';
import type { ChatWorkflowSseResponseType } from '@fastgpt/global/openapi/core/chat/completion/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(
  req: ApiRequestProps<SkillDebugChatBody>,
  res: ApiResponseType<ChatWorkflowSseResponseType>
): Promise<ChatWorkflowSseResponseType> {
  const { body } = parseApiInput({ req, bodySchema: SkillDebugChatBodySchema });

  return handleSkillDebugChat(req, res, body);
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: '20mb'
  }
};
