import { ChatItemType } from '@/types/chat';
import { Chat, App, ChatItem } from '@/service/mongo';
import { ChatSourceEnum } from '@/constants/chat';

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
    const chatHistory = await Chat.findOne(
      {
        chatId,
        userId,
        appId
      },
      '_id'
    );

    const promise: any[] = [
      ChatItem.insertMany(
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
        Chat.updateOne(
          { chatId, userId, appId },
          {
            title: content[0].value.slice(0, 20),
            updateTime: new Date()
          }
        )
      );
    } else {
      promise.push(
        Chat.create({
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
        App.findByIdAndUpdate(appId, {
          updateTime: new Date()
        })
      );
    }

    await Promise.all(promise);
  } catch (error) {
    Chat.updateOne(
      { chatId, userId },
      {
        $push: {
          content: {
            $each: [],
            $slice: -10
          }
        }
      }
    );
  }
}
