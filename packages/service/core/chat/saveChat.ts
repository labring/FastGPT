import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type.d';
import { MongoApp } from '../app/schema';
import type { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { MongoChatItem } from './chatItemSchema';
import { MongoChat } from './chatSchema';
import { addLog } from '../../common/system/log';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { type StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getAppChatConfig, getGuideModule } from '@fastgpt/global/core/workflow/utils';
import { type AppChatConfigType } from '@fastgpt/global/core/app/type';
import { mergeChatResponseData } from '@fastgpt/global/core/chat/utils';
import { pushChatLog } from './pushChatLog';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { extractDeepestInteractive } from '@fastgpt/global/core/workflow/runtime/utils';

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
  sourceName?: string;
  shareId?: string;
  outLinkUid?: string;
  content: [UserChatItemType & { dataId?: string }, AIChatItemType & { dataId?: string }];
  metadata?: Record<string, any>;
  durationSeconds: number; //s
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
  sourceName,
  shareId,
  outLinkUid,
  content,
  durationSeconds,
  metadata = {}
}: Props) {
  if (!chatId || chatId === 'NO_RECORD_HISTORIES') return;

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
    const pluginInputs = nodes?.find(
      (node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput
    )?.inputs;

    // Format save chat content: Remove quote q/a
    const processedContent = content.map((item) => {
      if (item.obj === ChatRoleEnum.AI) {
        const nodeResponse = item[DispatchNodeResponseKeyEnum.nodeResponse]?.map((responseItem) => {
          if (
            responseItem.moduleType === FlowNodeTypeEnum.datasetSearchNode &&
            responseItem.quoteList
          ) {
            return {
              ...responseItem,
              quoteList: responseItem.quoteList.map((quote: any) => ({
                id: quote.id,
                chunkIndex: quote.chunkIndex,
                datasetId: quote.datasetId,
                collectionId: quote.collectionId,
                sourceId: quote.sourceId,
                sourceName: quote.sourceName,
                score: quote.score,
                tokens: quote.tokens
              }))
            };
          }
          return responseItem;
        });

        return {
          ...item,
          [DispatchNodeResponseKeyEnum.nodeResponse]: nodeResponse,
          durationSeconds
        };
      }
      return item;
    });

    await mongoSessionRun(async (session) => {
      const [{ _id: chatItemIdHuman }, { _id: chatItemIdAi }] = await MongoChatItem.insertMany(
        processedContent.map((item) => ({
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
            pluginInputs,
            title: newTitle,
            source,
            sourceName,
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

      pushChatLog({
        chatId,
        chatItemIdHuman: String(chatItemIdHuman),
        chatItemIdAi: String(chatItemIdAi),
        appId
      });
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
  userInteractiveVal,
  aiResponse,
  newVariables,
  durationSeconds
}: {
  chatId: string;
  appId: string;
  userInteractiveVal: string;
  aiResponse: AIChatItemType & { dataId?: string };
  newVariables?: Record<string, any>;
  durationSeconds: number;
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

  let finalInteractive = extractDeepestInteractive(interactiveValue.interactive);

  if (finalInteractive.type === 'userSelect') {
    finalInteractive.params.userSelectedVal = userInteractiveVal;
  } else if (
    finalInteractive.type === 'userInput' &&
    typeof parsedUserInteractiveVal === 'object'
  ) {
    finalInteractive.params.inputForm = finalInteractive.params.inputForm.map((item) => {
      const itemValue = parsedUserInteractiveVal[item.label];
      return itemValue !== undefined
        ? {
            ...item,
            value: itemValue
          }
        : item;
    });
    finalInteractive.params.submitted = true;
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

  chatItem.durationSeconds = chatItem.durationSeconds
    ? +(chatItem.durationSeconds + durationSeconds).toFixed(2)
    : durationSeconds;

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
          updateTime: new Date()
        }
      },
      {
        session
      }
    );
  });
};
