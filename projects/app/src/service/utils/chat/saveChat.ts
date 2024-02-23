import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { addLog } from '@fastgpt/service/common/system/log';
import { chatContentReplaceBlock } from '@fastgpt/global/core/chat/utils';

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

    const promise: any[] = [
      MongoChatItem.insertMany(
        content.map((item) => ({
          chatId,
          teamId,
          tmbId,
          appId,
          ...item
        }))
      )
    ];

    const title =
      chatContentReplaceBlock(content[0].value).slice(0, 20) ||
      content[1]?.value?.slice(0, 20) ||
      'Chat';

    if (chat) {
      promise.push(
        MongoChat.updateOne(
          { appId, chatId },
          {
            title,
            updateTime: new Date(),
            metadata: metadataUpdate
          }
        )
      );
    } else {
      promise.push(
        MongoChat.create({
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
        })
      );
    }

    if (updateUseTime && source === ChatSourceEnum.online) {
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
