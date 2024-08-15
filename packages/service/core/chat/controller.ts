import type { ChatItemType, ChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { MongoChatItem } from './chatItemSchema';
import { addLog } from '../../common/system/log';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { delFileByFileIdList, getGFSCollection } from '../../common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { MongoChat } from './chatSchema';

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
}): Promise<{ histories: ChatItemType[] }> {
  if (!chatId) {
    return { histories: [] };
  }

  const histories = await MongoChatItem.find({ appId, chatId }, field)
    .sort({ _id: -1 })
    .limit(limit)
    .lean();

  histories.reverse();

  histories.forEach((item) => {
    // @ts-ignore
    item.value = adaptStringValue(item.value);
  });

  return { histories };
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

/*
  Update the user selected index of the interactive module
*/
export const updateUserSelectedResult = async ({
  appId,
  chatId,
  userSelectedVal
}: {
  appId: string;
  chatId?: string;
  userSelectedVal: string;
}) => {
  if (!chatId) return;
  try {
    const chatItem = await MongoChatItem.findOne(
      { appId, chatId, obj: ChatRoleEnum.AI },
      'value'
    ).sort({ _id: -1 });

    if (!chatItem) return;

    const interactiveValue = chatItem.value.find(
      (v) => v.type === ChatItemValueTypeEnum.interactive
    );

    if (
      !interactiveValue ||
      interactiveValue.type !== ChatItemValueTypeEnum.interactive ||
      !interactiveValue.interactive?.params
    )
      return;

    interactiveValue.interactive = {
      ...interactiveValue.interactive,
      params: {
        ...interactiveValue.interactive.params,
        userSelectedVal
      }
    };

    await chatItem.save();
  } catch (error) {
    addLog.error('updateUserSelectedResult error', error);
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
  if (!appId && !chatIdList) return Promise.reject('appId or chatIdList is required');

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
