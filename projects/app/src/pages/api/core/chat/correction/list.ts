import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type {
  ListChatCorrectionParams,
  ListChatCorrectionResponse
} from '@fastgpt/global/core/chat/correction/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoChatCorrection } from '@fastgpt/service/core/chat/correction/schema';

type ListQueryType = {
  appId: string;
  chatId?: string;
  dataId?: string;
  _id?: string;
};

async function handler(
  req: ApiRequestProps<ListChatCorrectionParams>,
  _res: ApiResponseType<any>
): Promise<ListChatCorrectionResponse> {
  const { appId, chatId, dataId, correctionId } = req.body;

  // Authentication
  await authChatCrud({
    req,
    authToken: true,
    appId,
    chatId
  });

  // Build query
  const query: ListQueryType = { appId };
  if (chatId) query.chatId = chatId;
  if (dataId) query.dataId = dataId;
  if (correctionId) query._id = correctionId;

  // Query corrections with user info
  const corrections = await MongoChatCorrection.find(query)
    .populate<{ userId: { username: string } }>('userId', 'username')
    .sort({ updateTime: -1 })
    .lean();

  return corrections.map((correction) => ({
    _id: correction._id,
    dataId: correction.dataId,
    chatId: correction.chatId,
    appId: correction.appId,
    correctionData: correction.correctionData,
    createTime: correction.createTime,
    updateTime: correction.updateTime,
    userName: correction.userId?.username
  }));
}

export default NextAPI(handler);
