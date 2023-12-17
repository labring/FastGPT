import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { MongoChatItem } from './chatItemSchema';
import { addLog } from '../../common/system/log';

export async function getChatItems({
  chatId,
  limit = 30,
  field
}: {
  chatId?: string;
  limit?: number;
  field: string;
}): Promise<{ history: ChatItemType[] }> {
  if (!chatId) {
    return { history: [] };
  }

  const history = await MongoChatItem.find({ chatId }, field).sort({ _id: -1 }).limit(limit).lean();

  history.reverse();

  return { history };
}

export const addCustomFeedbacks = async ({
  chatId,
  chatItemId,
  feedbacks
}: {
  chatId?: string;
  chatItemId?: string;
  feedbacks: string[];
}) => {
  if (!chatId || !chatItemId) return;

  try {
    await MongoChatItem.findOneAndUpdate(
      {
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
