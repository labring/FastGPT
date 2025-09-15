import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type.d';
import { MongoApp } from '../app/schema';
import type { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
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
import { MongoAppChatLog } from '../app/logs/chatLogsSchema';
import { writePrimary } from '../../common/mongo/utils';

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
  userContent: UserChatItemType & { dataId?: string };
  aiContent: AIChatItemType & { dataId?: string };
  metadata?: Record<string, any>;
  durationSeconds: number; //s
  errorMsg?: string;
};

const updateChatLog = async ({
  chatId,
  appId,
  teamId,
  tmbId,
  source,
  sourceName,
  outLinkUid,
  aiContent,
  durationSeconds
}: Props) => {
  try {
    const userId = String(outLinkUid || tmbId);
    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

    const errorCount = aiContent?.responseData?.some((item) => item.errorText) ? 1 : 0;
    const totalPoints =
      aiContent?.responseData?.reduce(
        (sum: number, item: any) => sum + (item.totalPoints || 0),
        0
      ) || 0;

    const hasHistoryChat = await MongoAppChatLog.exists({
      teamId,
      appId,
      userId,
      createTime: { $lt: now }
    });

    await MongoAppChatLog.updateOne(
      {
        teamId,
        appId,
        chatId,
        updateTime: { $gte: fifteenMinutesAgo }
      },
      {
        $inc: {
          chatItemCount: 1,
          errorCount,
          totalPoints,
          totalResponseTime: durationSeconds
        },
        $set: {
          updateTime: now,
          sourceName
        },
        $setOnInsert: {
          appId,
          teamId,
          chatId,
          userId,
          source,
          createTime: now,
          goodFeedbackCount: 0,
          badFeedbackCount: 0,
          isFirstChat: !hasHistoryChat
        }
      },
      {
        upsert: true
      }
    );
  } catch (error) {
    addLog.error('update chat log error', error);
  }
};

export async function saveChat(props: Props) {
  const {
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
    userContent,
    aiContent,
    durationSeconds,
    errorMsg,
    metadata = {}
  } = props;

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
    const formatAiContent = (() => {
      const nodeResponse = aiContent[DispatchNodeResponseKeyEnum.nodeResponse]?.map(
        (responseItem) => {
          // Filter quote raw textx
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
        }
      );

      return {
        ...aiContent,
        [DispatchNodeResponseKeyEnum.nodeResponse]: nodeResponse,
        durationSeconds,
        errorMsg
      };
    })();
    const processedContent = [userContent, formatAiContent];

    await mongoSessionRun(async (session) => {
      const [{ _id: chatItemIdHuman }, { _id: chatItemIdAi }] = await MongoChatItem.create(
        processedContent.map((item) => ({
          chatId,
          teamId,
          tmbId,
          appId,
          ...item
        })),
        { session, ordered: true, ...writePrimary }
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
          upsert: true,
          ...writePrimary
        }
      );

      pushChatLog({
        chatId,
        chatItemIdHuman: String(chatItemIdHuman),
        chatItemIdAi: String(chatItemIdAi),
        appId
      });
    });

    // Update chat log
    await updateChatLog(props);

    if (isUpdateUseTime) {
      await MongoApp.updateOne(
        { _id: appId },
        {
          updateTime: new Date()
        },
        {
          ...writePrimary
        }
      ).catch();
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

  if (!interactiveValue || !interactiveValue.interactive) {
    return;
  }
  interactiveValue.interactive.params = interactiveValue.interactive.params || {};

  // Update interactive value
  const parsedUserInteractiveVal = (() => {
    try {
      return JSON.parse(userInteractiveVal);
    } catch (err) {
      return userInteractiveVal;
    }
  })();
  const finalInteractive = extractDeepestInteractive(interactiveValue.interactive);

  if (
    finalInteractive.type === 'userSelect' ||
    finalInteractive.type === 'agentPlanAskUserSelect'
  ) {
    finalInteractive.params.userSelectedVal = userInteractiveVal;
  } else if (
    (finalInteractive.type === 'userInput' || finalInteractive.type === 'agentPlanAskUserForm') &&
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
  } else if (finalInteractive.type === 'agentPlanCheck') {
    finalInteractive.params.confirmed = true;
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

    // TODO: 特殊的交互需要推送 chat item，不能只修改
    // if (
    //   finalInteractive.type === 'agentPlanAskQuery' ||
    //   finalInteractive.type === 'agentPlanCheck'
    // ) {
    //   const [{ _id: chatItemIdHuman }, { _id: chatItemIdAi }] = await MongoChatItem.insertMany(
    //     processedContent.map((item) => ({
    //       chatId,
    //       teamId,
    //       tmbId,
    //       appId,
    //       ...item
    //     })),
    //     { session }
    //   );
    // }
  });
};
