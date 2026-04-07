import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatGernateStatusEnum } from '@fastgpt/global/core/chat/constants';

type EnsureGenerateChatParams = {
  appId: string;
  chatId: string;
  teamId: string;
  tmbId: string;
  source: string;
  sourceName?: string;
  shareId?: string;
  outLinkUid?: string;
};
export const ensureGenerateChat = async (params: EnsureGenerateChatParams) => {
  const now = new Date();
  await MongoChat.updateOne(
    {
      appId: params.appId,
      chatId: params.chatId
    },
    {
      $set: {
        ...params,
        updateTime: now,
        hasBeenRead: false,
        chatGenerateStatus: ChatGernateStatusEnum.generating
      },
      $setOnInsert: {
        createTime: now
      }
    },
    {
      upsert: true
    }
  );
};

type UpdateChatGenerateStatusParams = Pick<EnsureGenerateChatParams, 'appId' | 'chatId'> & {
  status: ChatGernateStatusEnum;
};
export const updateChatGenerateStatus = async (params: UpdateChatGenerateStatusParams) => {
  const { appId, chatId, status } = params;
  const now = new Date();
  await MongoChat.updateOne(
    { appId, chatId },
    {
      $set: {
        chatGenerateStatus: status,
        updateTime: now
      }
    }
  );
};
