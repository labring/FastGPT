import type { ChatHistoryItemResType, ChatItemType } from '@fastgpt/global/core/chat/type';
import { MongoChatItem } from './chatItemSchema';
import { addLog } from '../../common/system/log';
import { delFileByFileIdList, getGFSCollection } from '../../common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { MongoChat } from './chatSchema';
import { UserError } from '@fastgpt/global/common/error/utils';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { MongoChatItemResponse } from './chatItemResponseSchema';

export async function getChatItems({
  appId,
  chatId,
  offset,
  limit,
  field
}: {
  appId: string;
  chatId?: string;
  offset: number;
  limit: number;
  field: string;
}): Promise<{ histories: ChatItemType[]; total: number }> {
  if (!chatId) {
    return { histories: [], total: 0 };
  }

  // Extend dataId
  field = `dataId ${field}`;

  const [histories, total] = await Promise.all([
    MongoChatItem.find({ appId, chatId }, field).sort({ _id: -1 }).skip(offset).limit(limit).lean(),
    MongoChatItem.countDocuments({ appId, chatId })
  ]);
  histories.reverse();

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

/* 
  Delete chat files
  1. ChatId: Delete one chat files
  2. AppId: Delete all the app's chat files
*/
export const deleteChatFiles = async ({
  chatIdList,
  appId
}: {
  chatIdList?: string[];
  appId?: string;
}) => {
  if (!appId && !chatIdList)
    return Promise.reject(new UserError('appId or chatIdList is required'));

  const appChatIdList = await (async () => {
    if (appId) {
      const appChatIdList = await MongoChat.find({ appId }, { chatId: 1 });
      return appChatIdList.map((item) => String(item.chatId));
    } else if (chatIdList) {
      return chatIdList;
    }
    return [];
  })();

  const collection = getGFSCollection(BucketNameEnum.chat);
  const where = {
    'metadata.chatId': { $in: appChatIdList }
  };

  const files = await collection.find(where, { projection: { _id: 1 } }).toArray();

  await delFileByFileIdList({
    bucketName: BucketNameEnum.chat,
    fileIdList: files.map((item) => String(item._id))
  });
};
