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

  if (chatHistory) {
    await Chat.findOneAndUpdate(
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
    );
  } else {
    await Chat.create({
      chatId,
      userId,
      appId,
      variables,
      title: content[0].value.slice(0, 20),
      source,
      shareId,
      content: content
    });
  }

  if (isOwner && source === ChatSourceEnum.online) {
    App.findByIdAndUpdate(appId, {
      updateTime: new Date()
    });
  }
}
