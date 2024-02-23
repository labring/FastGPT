import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { addLog } from '@fastgpt/service/common/system/log';
import { chatContentReplaceBlock } from '@fastgpt/global/core/chat/utils';
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
  content: [ChatItemType, ChatItemType];
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
    const title =
      chatContentReplaceBlock(content[0].value).slice(0, 20) ||
      content[1]?.value?.slice(0, 20) ||
      'Chat';

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
        MongoChat.create(
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
