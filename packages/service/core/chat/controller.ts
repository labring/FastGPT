import type { ChatHistoryItemResType, ChatItemType } from '@fastgpt/global/core/chat/type';
import { MongoChatItem } from './chatItemSchema';
import { addLog } from '../../common/system/log';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { MongoChatItemResponse } from './chatItemResponseSchema';

export async function getChatItems({
  appId,
  chatId,
  offset,
  limit,
  field,
  targetDataId,
  contextSize = 10
}: {
  appId: string;
  chatId?: string;
  offset: number;
  limit: number;
  field: string;
  targetDataId?: string;
  contextSize?: number;
}): Promise<{ histories: ChatItemType[]; total: number }> {
  if (!chatId) {
    return { histories: [], total: 0 };
  }

  // Extend dataId
  field = `dataId ${field}`;

  // Choose query mode based on whether targetDataId is provided
  const { histories, total } = await (async () => {
    if (targetDataId) {
      // Mode 1: fetch records around the target message
      const targetItem = await MongoChatItem.findOne({
        appId,
        chatId,
        dataId: targetDataId
      }).lean();

      if (!targetItem) {
        return { histories: [], total: 0 };
      }

      // Fetch previous and next messages in parallel
      const [prevItems, nextItems] = await Promise.all([
        MongoChatItem.find(
          {
            appId,
            chatId,
            time: { $lt: targetItem.time }
          },
          field
        )
          .sort({ time: -1 })
          .limit(contextSize)
          .lean(),
        MongoChatItem.find(
          {
            appId,
            chatId,
            time: { $gt: targetItem.time }
          },
          field
        )
          .sort({ time: 1 })
          .limit(contextSize)
          .lean()
      ]);

      // Merge result: prev N + target + next N
      const histories = [...prevItems.reverse(), targetItem, ...nextItems];
      return { histories, total: histories.length };
    } else {
      // Mode 2: normal pagination
      const [histories, total] = await Promise.all([
        MongoChatItem.find({ appId, chatId }, field)
          .sort({ _id: -1 })
          .skip(offset)
          .limit(limit)
          .lean(),
        MongoChatItem.countDocuments({ appId, chatId })
      ]);
      return { histories: histories.reverse(), total };
    }
  })();

  // Add node responses field
  if (field.includes(DispatchNodeResponseKeyEnum.nodeResponse)) {
    const chatItemDataIds = histories
      .filter((item) => item.obj === ChatRoleEnum.AI && !item.responseData?.length)
      .map((item) => item.dataId);

    const chatItemResponsesMap = await MongoChatItemResponse.find(
      { appId, chatId, chatItemDataId: { $in: chatItemDataIds } },
      { chatItemDataId: 1, data: 1 }
    )
      .lean()
      .then((res) => {
        const map = new Map<string, ChatHistoryItemResType[]>();
        res.forEach((item) => {
          const val = map.get(item.chatItemDataId) || [];
          val.push(item.data);
          map.set(item.chatItemDataId, val);
        });
        return map;
      });

    histories.forEach((item) => {
      const val = chatItemResponsesMap.get(String(item.dataId));
      if (item.obj === ChatRoleEnum.AI && val) {
        item.responseData = val;
      }
    });
  }

  return { histories, total };
}

export const addCustomFeedbacks = async ({
  appId,
  chatId,
  dataId,
  feedbacks
}: {
  appId: string;
  chatId?: string;
  dataId?: string;
  feedbacks: string[];
}) => {
  if (!chatId || !dataId) return;

  try {
    await MongoChatItem.findOneAndUpdate(
      {
        appId,
        chatId,
        dataId
      },
      {
        $push: { customFeedbacks: { $each: feedbacks } }
      }
    );
  } catch (error) {
    addLog.error('addCustomFeedbacks error', error);
  }
};
