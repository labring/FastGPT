import type {
  AIChatItemType,
  ChatItemType,
  UserChatItemType
} from '@fastgpt/global/core/chat/type.d';
import axios from 'axios';
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
import { mergeChatResponseData } from '@fastgpt/global/core/chat/utils';

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

// {
//   "title": "string",
//   "feedback": "like",
//   "chatItemId": "string",
//   "uid": "string",
//   "question": "string",
//   "answer": "string",
//   "chatId": "string",
//   "responseTime": 0,
//   "metadata": "string",
//   "sourceName": "string",
//   "createdAt": 0,
//   "sourceId": "string"
// }
type ChatLog = {
  title: string;
  feedback: 'like' | 'dislike' | null;
  chatItemId: string;
  uid: string;
  question: string;
  answer: string;
  chatId: string;
  responseTime: number;
  metadata: string;
  sourceName: string;
  createdAt: number;
  sourceId: string;
};

const pushChatLog = async ({ chatItemId, appId }: { chatItemId: string; appId: string }) => {
  const url = process.env.LOG_URL;
  if (!url) {
    return;
  }
  const chatItem = (await MongoChatItem.findById(chatItemId)) as ChatItemType & {
    userGoodFeedback?: string;
    userBadFeedback?: string;
    chatId: string;
    responseData: {
      moduleType: string;
      runningTime: number; //s
      historyPreview: { obj: string; value: string }[];
    }[];
    time: Date;
  };
  if (!chatItem) {
    return;
  }
  const [chat] = (await MongoChat.find({ chatId: chatItem.chatId }).lean()) as [
    {
      title: string;
      outLinkUid: string;
      metadata: Object;
      source: string;
    }
  ];
  if (!chat) {
    return;
  }
  const [question, answer] =
    chatItem.responseData
      .find((item) => item.moduleType === 'chatNode')
      ?.historyPreview.map((item) => item.value) ?? [];
  if (!question || !answer) {
    return;
  }
  const chatLog: ChatLog = {
    title: chat.title,
    feedback: (() => {
      if (chatItem.userGoodFeedback) {
        return 'like';
      } else if (chatItem.userBadFeedback) {
        return 'dislike';
      } else {
        return null;
      }
    })(),
    chatItemId: chatItemId,
    uid: chat.outLinkUid,
    question,
    answer,
    chatId: chatItem.chatId,
    responseTime:
      (chatItem.responseData.find((item) => item.moduleType === 'chatNode')?.runningTime ?? 0) *
      1000,
    metadata: '{}', // TODO: chat.metadata,
    sourceName: chat.source ?? '-',
    createdAt: new Date(chatItem.time).getTime(),
    sourceId: `crbeer-fastgpt-${appId}`
  };
  const result = await axios.post(url + '/api/chat/push', chatLog);
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
      const [{}, { _id: chatItemId }] = await MongoChatItem.insertMany(
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
      setTimeout(() => {
        pushChatLog({ chatItemId: String(chatItemId), appId });
      }, 1000); // 10s
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

  // Update interactive value
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

  if (interactiveValue.interactive.type === 'userSelect') {
    interactiveValue.interactive = {
      ...interactiveValue.interactive,
      params: {
        ...interactiveValue.interactive.params,
        userSelectedVal: userInteractiveVal
      }
    };
  } else if (
    interactiveValue.interactive.type === 'userInput' &&
    typeof parsedUserInteractiveVal === 'object'
  ) {
    interactiveValue.interactive = {
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
  }

  if (aiResponse.customFeedbacks) {
    chatItem.customFeedbacks = chatItem.customFeedbacks
      ? [...chatItem.customFeedbacks, ...aiResponse.customFeedbacks]
      : aiResponse.customFeedbacks;
  }

  if (aiResponse.responseData) {
    chatItem.responseData = chatItem.responseData
      ? mergeChatResponseData([...chatItem.responseData, ...aiResponse.responseData])
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
