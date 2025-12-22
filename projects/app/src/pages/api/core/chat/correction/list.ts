import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type {
  ListChatCorrectionParams,
  ListChatCorrectionResponse
} from '@fastgpt/global/core/chat/correction/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoChatCorrection } from '@fastgpt/service/core/chat/correction/schema';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';

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
  const { appId, chatId, dataId, correctionId, startTime, endTime } = req.body;

  // Authentication
  await authChatCrud({
    req,
    authToken: true,
    appId,
    chatId
  });

  // Parse pagination
  let { offset, pageSize } = parsePaginationRequest(req);
  pageSize = Math.min(pageSize || 20, 100);

  // Build query
  const query: ListQueryType = { appId };
  if (chatId) query.chatId = chatId;
  if (dataId) query.dataId = dataId;
  if (correctionId) query._id = correctionId;

  // Build time range filter
  const timeMatch: Record<string, any> = {};
  if (startTime || endTime) {
    timeMatch.updateTime = {
      ...(startTime && { $gte: new Date(startTime) }),
      ...(endTime && { $lte: new Date(endTime) })
    };
  }

  // Merge base query with time filter
  const mergeQuery = { ...query, ...timeMatch };

  // Query corrections with pagination (parallel fetch)
  const [corrections, total] = await Promise.all([
    MongoChatCorrection.find(mergeQuery)
      .populate<{ tmbId: { name: string } }>('tmbId', 'name')
      .sort({ updateTime: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoChatCorrection.countDocuments(mergeQuery)
  ]);

  return {
    list: corrections.map((correction) => ({
      _id: correction._id,
      dataId: correction.dataId,
      chatId: correction.chatId,
      appId: correction.appId,
      correctionData: correction.correctionData,
      updateTime: correction.updateTime,
      userName: correction.tmbId?.name
    })),
    total
  };
}

export default NextAPI(handler);
