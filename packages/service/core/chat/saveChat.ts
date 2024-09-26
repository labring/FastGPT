import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type.d';
import { MongoApp } from '../app/schema';
import {
  ChatItemValueTypeEnum,
  ChatRoleEnum,
  ChatSourceEnum
} from '@fastgpt/global/core/chat/constants';
import { MongoChatItem } from './chatItemSchema';
import { MongoChat } from './chatSchema';
import { addLog } from '../../common/system/log';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getAppChatConfig, getGuideModule } from '@fastgpt/global/core/workflow/utils';
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
  newTitle: string;
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
  newTitle,
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
    const { welcomeText, variables: variableList } = getAppChatConfig({
      chatConfig: appChatConfig,
      systemConfigNode: getGuideModule(nodes),
      isPublicFetch: false
    });

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

      await MongoChat.updateOne(
        {
          appId,
          chatId
        },
        {
          $set: {
            teamId,
            tmbId,
            appId,
            chatId,
            variableList,
            welcomeText,
            variables: variables || {},
            title: newTitle,
            source,
            shareId,
            outLinkUid,
            metadata: metadataUpdate,
            updateTime: new Date()
          }
        },
        {
          session,
          upsert: true
        }
      );
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

export const updateInteractiveChat = async ({
  chatId,
  appId,
  teamId,
  tmbId,
  userInteractiveVal,
  aiResponse,
  newVariables,
  newTitle
}: {
  chatId: string;
  appId: string;
  teamId: string;
  tmbId: string;
  userInteractiveVal: string;
  aiResponse: AIChatItemType & { dataId?: string };
  newVariables?: Record<string, any>;
  newTitle: string;
}) => {
  if (!chatId) return;

  const chatItem = await MongoChatItem.findOne({ appId, chatId, obj: ChatRoleEnum.AI }).sort({
    _id: -1
  });

  if (!chatItem || chatItem.obj !== ChatRoleEnum.AI) return;

  const interactiveValue = chatItem.value[chatItem.value.length - 1];

  if (
    !interactiveValue ||
    interactiveValue.type !== ChatItemValueTypeEnum.interactive ||
    !interactiveValue.interactive?.params
  ) {
    return;
  }

  const parsedUserInteractiveVal = (() => {
    try {
      return JSON.parse(userInteractiveVal);
    } catch (err) {
      return userInteractiveVal;
    }
  })();
  interactiveValue.interactive =
    interactiveValue.interactive.type === 'userSelect'
      ? {
          ...interactiveValue.interactive,
          params: {
            ...interactiveValue.interactive.params,
            userSelectedVal: userInteractiveVal
          }
        }
      : {
          ...interactiveValue.interactive,
          params: {
            ...interactiveValue.interactive.params,
            inputForm: interactiveValue.interactive.params.inputForm.map((item) => {
              const itemValue = parsedUserInteractiveVal[item.label];
              return itemValue !== undefined
                ? {
                    ...item,
                    value: itemValue
                  }
                : item;
            }),
            submitted: true
          }
        };

  if (aiResponse.customFeedbacks) {
    chatItem.customFeedbacks = chatItem.customFeedbacks
      ? [...chatItem.customFeedbacks, ...aiResponse.customFeedbacks]
      : aiResponse.customFeedbacks;
  }

  if (aiResponse.responseData) {
    chatItem.responseData = chatItem.responseData
      ? [...chatItem.responseData, ...aiResponse.responseData]
      : aiResponse.responseData;
  }

  if (aiResponse.value) {
    chatItem.value = chatItem.value ? [...chatItem.value, ...aiResponse.value] : aiResponse.value;
  }

  await mongoSessionRun(async (session) => {
    await chatItem.save({ session });
    await MongoChat.updateOne(
      {
        appId,
        chatId
      },
      {
        $set: {
          variables: newVariables,
          title: newTitle,
          updateTime: new Date()
        }
      },
      {
        session
      }
    );
  });
};
