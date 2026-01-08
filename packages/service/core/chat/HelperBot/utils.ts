import type {
  AIChatItemValueItemType,
  HelperBotTypeEnum
} from '@fastgpt/global/core/chat/helperBot/type';
import type { HelperBotCompletionsParamsType } from '@fastgpt/global/openapi/core/chat/helperBot/api';
import { MongoHelperBotChat } from './chatSchema';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { MongoHelperBotChatItem } from './chatItemSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';

export const pushChatRecords = async ({
  type,
  userId,
  chatId,
  chatItemId,
  query,
  files,
  aiResponse,
  memories,
  metadata
}: {
  type: HelperBotTypeEnum;
  userId: string;
  chatId: string;
  chatItemId: string;
  query: string;
  files: HelperBotCompletionsParamsType['files'];
  aiResponse: AIChatItemValueItemType[];
  memories?: Record<string, any>;
  metadata?: Record<string, any>;
}) => {
  const chat = await MongoHelperBotChat.findOne(
    {
      type,
      userId,
      chatId
    },
    '_id metadata'
  ).lean();
  const metadataUpdate = {
    ...chat?.metadata,
    ...metadata
  };

  const userValue: UserChatItemValueItemType[] = [
    ...files.map((file) => ({
      file: {
        type: file.type,
        name: file.name,
        url: '',
        key: file.key || ''
      }
    })),
    ...(query
      ? [
          {
            text: {
              content: query
            }
          }
        ]
      : [])
  ];

  await mongoSessionRun(async (session) => {
    await MongoHelperBotChatItem.create(
      [
        {
          userId,
          chatId,
          dataId: chatItemId,
          obj: ChatRoleEnum.Human,
          value: userValue
        },
        {
          userId,
          chatId,
          dataId: chatItemId,
          obj: ChatRoleEnum.AI,
          value: aiResponse,
          memories
        }
      ],
      { session, ordered: true }
    );

    await MongoHelperBotChat.updateOne(
      {
        type,
        userId,
        chatId
      },
      {
        updateTime: new Date(),
        metadata: metadataUpdate
      },
      {
        session
      }
    );
  });
};
