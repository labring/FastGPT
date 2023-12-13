import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { MongoChatItem } from './chatItemSchema';

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
