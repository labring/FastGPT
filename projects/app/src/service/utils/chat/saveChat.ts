import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { addLog } from '@fastgpt/service/common/mongo/controller';

type Props = {
  chatId: string;
  appId: string;
  userId: string;
  variables?: Record<string, any>;
  isOwner: boolean;
  source: `${ChatSourceEnum}`;
  shareId?: string;
  content: [ChatItemType, ChatItemType];
};

export async function saveChat({
  chatId,
  appId,
  userId,
  variables,
  isOwner,
  source,
  shareId,
  content
}: Props) {
  try {
    const chatHistory = await MongoChat.findOne(
      {
        chatId,
        userId,
        appId
      },
      '_id'
    );

    const promise: any[] = [
      MongoChatItem.insertMany(
        content.map((item) => ({
          chatId,
          userId,
          appId,
          ...item
        }))
      )
    ];

    if (chatHistory) {
      promise.push(
        MongoChat.updateOne(
          { chatId, userId, appId },
          {
            title: content[0].value.slice(0, 20),
            updateTime: new Date()
          }
        )
      );
    } else {
      promise.push(
        MongoChat.create({
          chatId,
          userId,
          appId,
          variables,
          title: content[0].value.slice(0, 20),
          source,
          shareId
        })
      );
    }

    if (isOwner && source === ChatSourceEnum.online) {
      promise.push(
        MongoApp.findByIdAndUpdate(appId, {
          updateTime: new Date()
        })
      );
    }

    await Promise.all(promise);
  } catch (error) {
    addLog.error(`update chat history error`, error);
  }
}
