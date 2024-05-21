import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type.d';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { addLog } from '@fastgpt/service/common/system/log';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type';
import {
  getAppChatConfig,
  getGuideModule,
  splitGuideModule
} from '@fastgpt/global/core/workflow/utils';
import { AppChatConfigType } from '@fastgpt/global/core/app/type';

type Props = {
  chatId: string;
  appId: string;
  teamId: string;
  tmbId: string;
  nodes: StoreNodeItemType[];
  appChatConfig?: AppChatConfigType;
  variables?: Record<string, any>;
  isUpdateUseTime: boolean;
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
  nodes,
  appChatConfig,
  variables,
  isUpdateUseTime,
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
        chat.variables = variables || {};
        await chat.save({ session });
      } else {
        const { welcomeText, variables: variableList } = getAppChatConfig({
          chatConfig: appChatConfig,
          systemConfigNode: getGuideModule(nodes),
          isPublicFetch: false
        });

        await MongoChat.create(
          [
            {
              chatId,
              teamId,
              tmbId,
              appId,
              variableList,
              welcomeText,
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

    if (isUpdateUseTime) {
      await MongoApp.findByIdAndUpdate(appId, {
        updateTime: new Date()
      });
    }
  } catch (error) {
    addLog.error(`update chat history error`, error);
  }
}
