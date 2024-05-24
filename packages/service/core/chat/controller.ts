import type { ChatItemType, ChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { MongoChatItem } from './chatItemSchema';
import { addLog } from '../../common/system/log';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';

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

  history.forEach((item) => {
    // @ts-ignore
    item.value = adaptStringValue(item.value);
  });

  return { history };
}
/* 临时适配旧的对话记录 */
export const adaptStringValue = (value: any): ChatItemValueItemType[] => {
  if (typeof value === 'string') {
    return [
      {
        type: ChatItemValueTypeEnum.text,
        text: {
          content: value
        }
      }
    ];
  }
  return value;
};

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
