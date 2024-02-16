import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { MongoChatItem } from './chatItemSchema';
import { addLog } from '../../common/system/log';

export async function getChatItems({
  appId,
  chatId,
  limit = 30,
  field
}: {
  appId: string;
  chatId?: string;
  limit?: number;
  field: string;
}): Promise<{ history: ChatItemType[] }> {
  if (!chatId) {
    return { history: [] };
  }

  const history = await MongoChatItem.find({ appId, chatId }, field)
    .sort({ _id: -1 })
    .limit(limit)
    .lean();

  history.reverse();

  return { history };
}

export const addCustomFeedbacks = async ({
  appId,
  chatId,
  chatItemId,
  feedbacks
}: {
  appId: string;
  chatId?: string;
  chatItemId?: string;
  feedbacks: string[];
}) => {
  if (!chatId || !chatItemId) return;

  try {
    await MongoChatItem.findOneAndUpdate(
      {
        appId,
        chatId,
        dataId: chatItemId
      },
      {
        $push: { customFeedbacks: { $each: feedbacks } }
      }
    );
  } catch (error) {
    addLog.error('addCustomFeedbacks error', error);
  }
};
