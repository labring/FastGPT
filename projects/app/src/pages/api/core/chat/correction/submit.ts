import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type {
  SubmitChatCorrectionParams,
  SubmitChatCorrectionResponse
} from '@fastgpt/global/core/chat/correction/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { submitChatCorrection } from '@fastgpt/service/core/chat/correction/controller';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';

async function handler(
  req: ApiRequestProps<SubmitChatCorrectionParams>,
  _res: ApiResponseType<any>
): Promise<SubmitChatCorrectionResponse> {
  const { appId, chatId, dataId, correctionData, modelName } = req.body;
  if (modelName === '' || !getEmbeddingModel(modelName))
    return Promise.reject('Model is unexisted');
  // 1. Authentication
  const { teamId, tmbId, uid } = await authChatCrud({
    req,
    authToken: true,
    appId,
    chatId
  });

  // 2. Validate chatItem exists
  const chatItem = await MongoChatItem.findOne({
    appId,
    chatId,
    dataId
  });

  if (!chatItem) {
    return Promise.reject('Chat item not found');
  }

  // 3. Call controller to process correction
  const correctionId = await submitChatCorrection({
    teamId,
    tmbId,
    userId: uid,
    appId,
    chatId,
    dataId,
    correctionData,
    modelName
  });

  return { correctionId };
}

export default NextAPI(handler);
