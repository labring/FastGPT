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
import {
  ConfirmPlanAgentText,
  DispatchNodeResponseKeyEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { extractDeepestInteractive } from '@fastgpt/global/core/workflow/runtime/utils';
import { MongoAppChatLog } from '../app/logs/chatLogsSchema';
import { writePrimary } from '../../common/mongo/utils';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';

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
const formatAiResponse = ({
  aiContent,
  durationSeconds,
  errorMsg
}: {
  aiContent: AIChatItemType & { dataId?: string };
  durationSeconds: number;
  errorMsg?: string;
}) => {
  const nodeResponse = aiContent[DispatchNodeResponseKeyEnum.nodeResponse]?.map((responseItem) => {
    // Filter quote raw textx
    if (responseItem.moduleType === FlowNodeTypeEnum.datasetSearchNode && responseItem.quoteList) {
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
    ...aiContent,
    [DispatchNodeResponseKeyEnum.nodeResponse]: nodeResponse,
    durationSeconds,
    errorMsg
  };
};

export const saveChat = async (props: Props) => {
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
    const processedContent = [
      userContent,
      formatAiResponse({
        aiContent,
        durationSeconds,
        errorMsg
      })
    ];

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
    addLog.error(`Save chat history error`, error);
  }
};

/* 
  更新交互节点，包含两种情况：
  1. 更新当前的 items，并把 value 追加到当前 items
  2. 新增 items, 次数只需要改当前的 items 里的交互节点值即可，其他属性追加在新增的 items 里
*/
export const updateInteractiveChat = async (props: Props) => {
  const {
    chatId,
    appId,
    userContent,
    aiContent,
    variables,
    durationSeconds,
    errorMsg,
    teamId,
    tmbId,
    newTitle,
    metadata
  } = props;

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

  // Get interactive value
  const { text: userInteractiveVal } = chatValue2RuntimePrompt(userContent.value);
  const parsedUserInteractiveVal = (() => {
    try {
      return JSON.parse(userInteractiveVal);
    } catch (err) {
      return userInteractiveVal;
    }
  })();
  // 拿到的是实参
  const finalInteractive = extractDeepestInteractive(interactiveValue.interactive);
  const pushNewItems =
    finalInteractive.type === 'agentPlanAskQuery' ||
    (finalInteractive.type === 'agentPlanCheck' && userInteractiveVal !== ConfirmPlanAgentText);

  // Update interactive value
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

  // Update current items
  if (!pushNewItems) {
    if (aiContent.customFeedbacks) {
      chatItem.customFeedbacks = chatItem.customFeedbacks
        ? [...chatItem.customFeedbacks, ...aiContent.customFeedbacks]
        : aiContent.customFeedbacks;
    }

    if (aiContent.responseData) {
      chatItem.responseData = chatItem.responseData
        ? mergeChatResponseData([...chatItem.responseData, ...aiContent.responseData])
        : aiContent.responseData;
    }

    if (aiContent.value) {
      chatItem.value = chatItem.value ? [...chatItem.value, ...aiContent.value] : aiContent.value;
    }

    if (aiContent.memories) {
      chatItem.memories = {
        ...chatItem.memories,
        ...aiContent.memories
      };
    }

    chatItem.durationSeconds = chatItem.durationSeconds
      ? +(chatItem.durationSeconds + durationSeconds).toFixed(2)
      : durationSeconds;
  }
  chatItem.markModified('value');

  await mongoSessionRun(async (session) => {
    await chatItem.save({ session });
    await MongoChat.updateOne(
      {
        appId,
        chatId
      },
      {
        $set: {
          variables,
          updateTime: new Date()
        }
      },
      {
        session
      }
    );

    if (pushNewItems) {
      const [{ _id: chatItemIdHuman }, { _id: chatItemIdAi }] = await MongoChatItem.insertMany(
        [
          userContent,
          formatAiResponse({
            aiContent,
            durationSeconds,
            errorMsg
          })
        ].map((item) => ({
          chatId,
          teamId,
          tmbId,
          appId,
          ...item
        })),
        { session }
      );
      pushChatLog({
        chatId,
        chatItemIdHuman: String(chatItemIdHuman),
        chatItemIdAi: String(chatItemIdAi),
        appId
      });
    }
  });

  await updateChatLog(props);
};
