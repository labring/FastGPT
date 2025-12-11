import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';

export type GetRecordsAroundBody = {
  appId: string;
  chatId: string;
  targetDataId: string;
  contextSize?: number;
};

export type GetRecordsAroundResponse = {
  records: ChatItemType[];
};

async function handler(
  req: ApiRequestProps<GetRecordsAroundBody>,
  _res: ApiResponseType<any>
): Promise<GetRecordsAroundResponse> {
  const { appId, chatId, targetDataId, contextSize = 10 } = req.body;

  await authChatCrud({
    req,
    authToken: true,
    ...req.body
  });
  // Find the target message
  const targetItem = await MongoChatItem.findOne({
    appId,
    chatId,
    dataId: targetDataId
  }).lean();

  if (!targetItem) {
    return { records: [] };
  }

  // Query previous and next messages around the target, by time
  const [prevItems, nextItems] = await Promise.all([
    MongoChatItem.find({
      appId,
      chatId,
      time: { $lt: targetItem.time }
    })
      .sort({ time: -1 })
      .limit(contextSize)
      .lean(),
    MongoChatItem.find({
      appId,
      chatId,
      time: { $gt: targetItem.time }
    })
      .sort({ time: 1 })
      .limit(contextSize)
      .lean()
  ]);

  // Merge and sort by time: previous + target + next
  const records = [...prevItems.reverse(), targetItem, ...nextItems];

  return { records };
}

export default NextAPI(handler);
