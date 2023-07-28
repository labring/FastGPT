import { ChatItemType } from '@/types/chat';
import { Chat, App } from '@/service/mongo';
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
  const chatHistory = await Chat.findOne(
    {
      chatId,
      userId
    },
    '_id'
  );

  const promise = [];

  if (chatHistory) {
    promise.push(
      Chat.findOneAndUpdate(
        { chatId },
        {
          $push: {
            content: {
              $each: content
            }
          },
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
        shareId,
        content: content
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
}
