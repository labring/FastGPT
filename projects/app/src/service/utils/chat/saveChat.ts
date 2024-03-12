import type {
  AIChatItemType,
  ChatItemType,
  UserChatItemType
} from '@fastgpt/global/core/chat/type.d';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { addLog } from '@fastgpt/service/common/system/log';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

type Props = {
  chatId: string;
  appId: string;
  teamId: string;
  tmbId: string;
  variables?: Record<string, any>;
  updateUseTime: boolean;
  source: `${ChatSourceEnum}`;
  shareId?: string;
  outLinkUid?: string;
  content: [UserChatItemType & { dataId?: string }, AIChatItemType & { dataId?: string }];
  metadata?: Record<string, any>;
};

export async function saveChat({
  chatId,
  appId,
  teamId,
  tmbId,
  variables,
  updateUseTime,
  source,
  shareId,
  outLinkUid,
  content,
  metadata = {}
}: Props) {
  try {
    const chat = await MongoChat.findOne(
      {
        appId,
        chatId
      },
      '_id metadata'
    );

    const metadataUpdate = {
      ...chat?.metadata,
      ...metadata
    };
    const title = getChatTitleFromChatMessage(content[0]);

    await mongoSessionRun(async (session) => {
      await MongoChatItem.insertMany(
        content.map((item) => ({
          chatId,
          teamId,
          tmbId,
          appId,
          ...item
        })),
        { session }
      );

      if (chat) {
        chat.title = title;
        chat.updateTime = new Date();
        chat.metadata = metadataUpdate;
        await chat.save({ session });
      } else {
        await MongoChat.create(
          [
            {
              chatId,
              teamId,
              tmbId,
              appId,
              variables,
              title,
              source,
              shareId,
              outLinkUid,
              metadata: metadataUpdate
            }
          ],
          { session }
        );
      }
    });

    if (updateUseTime && source === ChatSourceEnum.online) {
      MongoApp.findByIdAndUpdate(appId, {
        updateTime: new Date()
      });
    }
  } catch (error) {
    addLog.error(`update chat history error`, error);
  }
}
