import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type {
  DeleteChatCorrectionParams,
  DeleteChatCorrectionResponse
} from '@fastgpt/global/core/chat/correction/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { deleteChatCorrection } from '@fastgpt/service/core/chat/correction/controller';

async function handler(
  req: ApiRequestProps<DeleteChatCorrectionParams>,
  _res: ApiResponseType<any>
): Promise<DeleteChatCorrectionResponse> {
  const { appId, chatId, correctionId } = req.body;

  // Authentication
  const { teamId } = await authChatCrud({
    req,
    authToken: true,
    appId,
    chatId
  });

  // Delete correction and cleanup vectors
  await deleteChatCorrection({
    teamId: String(teamId),
    correctionId
  });

  return {};
}

export default NextAPI(handler);
