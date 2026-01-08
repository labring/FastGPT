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
import { type AppChatConfigType, type VariableItemType } from '@fastgpt/global/core/app/type';
import { mergeChatResponseData } from '@fastgpt/global/core/chat/utils';
import { pushChatLog } from './pushChatLog';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { extractDeepestInteractive } from '@fastgpt/global/core/workflow/runtime/utils';
import { MongoAppChatLog } from '../app/logs/chatLogsSchema';
import { writePrimary } from '../../common/mongo/utils';
import { MongoChatItemResponse } from './chatItemResponseSchema';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import type { ClientSession } from '../../common/mongo';
import { removeS3TTL } from '../../common/s3/utils';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { encryptSecretValue, anyValueDecrypt } from '../../common/secret/utils';
import type { SecretValueType } from '@fastgpt/global/common/secret/type';

export type Props = {
  chatId: string;
  appId: string;
  versionId?: string;
  teamId: string;
  tmbId: string;
  nodes: StoreNodeItemType[];
  appChatConfig?: AppChatConfigType;
  variables?: Record<string, any>;
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

const beforProcess = (props: Props) => {
  // Remove url
  props.userContent.value.forEach((item) => {
    if (item.type === ChatItemValueTypeEnum.file && item.file?.key) {
      item.file.url = '';
    }
  });
};
const afterProcess = async ({
  contents,
  variables,
  variableList,
  session
}: {
  contents: (UserChatItemType | AIChatItemType)[];
  variables?: Record<string, any>;
  variableList?: VariableItemType[];
  session: ClientSession;
}) => {
  const contentFileKeys = contents
    .map((item) => {
      if (item.value && Array.isArray(item.value)) {
        return item.value.flatMap((valueItem) => {
          const keys: string[] = [];

          // 1. chat file
          if (valueItem.type === ChatItemValueTypeEnum.file && valueItem.file?.key) {
            keys.push(valueItem.file.key);
          }

          // 2. plugin input
          if (valueItem.type === 'text' && valueItem.text?.content) {
            try {
              const parsed = JSON.parse(valueItem.text.content);
              // 2.1 plugin input - 数组格式
              if (Array.isArray(parsed)) {
                parsed.forEach((field) => {
                  if (field.value && Array.isArray(field.value)) {
                    field.value.forEach((file: { key: string }) => {
                      if (file.key && typeof file.key === 'string') {
                        keys.push(file.key);
                      }
                    });
                  }
                });
              }
              // 2.2 form input - 对象格式 { "字段名": [{ key, url, ... }] }
              else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                Object.values(parsed).forEach((fieldValue) => {
                  if (Array.isArray(fieldValue)) {
                    fieldValue.forEach((file: any) => {
                      if (
                        file &&
                        typeof file === 'object' &&
                        file.key &&
                        typeof file.key === 'string'
                      ) {
                        keys.push(file.key);
                      }
                    });
                  }
                });
              }
            } catch (err) {}
          }

          return keys;
        });
      }
      return [];
    })
    .flat()
    .filter(Boolean) as string[];

  const variableFileKeys: string[] = [];
  if (variables && variableList) {
    variableList.forEach((varItem) => {
      if (varItem.type === VariableInputEnum.file) {
        const varValue = variables[varItem.key];
        if (Array.isArray(varValue)) {
          variableFileKeys.push(...varValue.map((item) => item.key));
        }
      }
    });
  }

  const allFileKeys = [...new Set([...contentFileKeys, ...variableFileKeys])];

  if (allFileKeys.length > 0) {
    await removeS3TTL({ key: allFileKeys, bucketName: 'private', session });
  }
};

const formatAiContent = ({
  aiContent,
  durationSeconds,
  errorMsg
}: {
  aiContent: AIChatItemType & { dataId?: string };
  durationSeconds: number;
  errorMsg?: string;
}) => {
  const { responseData, ...aiResponse } = aiContent;

  const citeCollectionIds = new Set<string>();

  const nodeResponses = responseData?.map((responseItem) => {
    if (responseItem.moduleType === FlowNodeTypeEnum.datasetSearchNode && responseItem.quoteList) {
      return {
        ...responseItem,
        quoteList: responseItem.quoteList.map((quote) => {
          citeCollectionIds.add(quote.collectionId);
          return {
            id: quote.id,
            chunkIndex: quote.chunkIndex,
            datasetId: quote.datasetId,
            collectionId: quote.collectionId,
            sourceId: quote.sourceId,
            sourceName: quote.sourceName,
            score: quote.score
          };
        })
      };
    }
    return responseItem;
  });

  return {
    aiResponse: {
      ...aiResponse,
      durationSeconds,
      errorMsg,
      citeCollectionIds: Array.from(citeCollectionIds)
    },
    nodeResponses,
    citeCollectionIds
  };
};

const getChatDataLog = async ({
  nodeResponses
}: {
  nodeResponses: ReturnType<typeof formatAiContent>['nodeResponses'];
}) => {
  const now = new Date();
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

  const errorCount = nodeResponses?.some((item) => item.errorText) ? 1 : 0;
  const totalPoints =
    nodeResponses?.reduce((sum: number, item: any) => sum + (item.totalPoints || 0), 0) || 0;

  return {
    fifteenMinutesAgo,
    errorCount,
    totalPoints,
    now
  };
};

export async function saveChat(props: Props) {
  beforProcess(props);

  const {
    chatId,
    appId,
    versionId,
    teamId,
    tmbId,
    nodes,
    appChatConfig,
    variables,
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
    const { aiResponse, nodeResponses } = formatAiContent({
      aiContent,
      durationSeconds,
      errorMsg
    });
    const processedContent = [userContent, aiResponse];

    await mongoSessionRun(async (session) => {
      const [{ _id: chatItemIdHuman }, { _id: chatItemIdAi, dataId }] = await MongoChatItem.create(
        processedContent.map((item) => ({
          chatId,
          teamId,
          tmbId,
          appId,
          ...item
        })),
        { session, ordered: true, ...writePrimary }
      );

      // Create chat item respones
      if (nodeResponses) {
        await MongoChatItemResponse.create(
          nodeResponses.map((item) => ({
            teamId,
            appId,
            chatId,
            chatItemDataId: dataId,
            data: item
          })),
          { session, ordered: true, ...writePrimary }
        );
      }

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
            appVersionId: versionId,
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
          },
          $setOnInsert: {
            createTime: new Date()
          }
        },
        {
          session,
          upsert: true,
          ...writePrimary
        }
      );

      await afterProcess({
        contents: processedContent,
        variables,
        variableList,
        session
      });

      pushChatLog({
        chatId,
        chatItemIdHuman: String(chatItemIdHuman),
        chatItemIdAi: String(chatItemIdAi),
        appId
      });
    });

    // Create chat data log
    try {
      const { fifteenMinutesAgo, errorCount, totalPoints, now } = await getChatDataLog({
        nodeResponses
      });
      const userId = String(outLinkUid || tmbId);

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
          upsert: true,
          ...writePrimary
        }
      );
    } catch (error) {
      addLog.error('Push chat log error', error);
    }
  } catch (error) {
    addLog.error(`update chat history error`, error);
  }
}

export const updateInteractiveChat = async (props: Props) => {
  beforProcess(props);

  const {
    teamId,
    chatId,
    appId,
    nodes,
    appChatConfig,
    userContent,
    aiContent,
    variables,
    durationSeconds,
    errorMsg
  } = props;
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
    const { text: userInteractiveVal } = chatValue2RuntimePrompt(userContent.value);
    try {
      return JSON.parse(userInteractiveVal);
    } catch (err) {
      return userInteractiveVal;
    }
  })();
  const { aiResponse, nodeResponses } = formatAiContent({
    aiContent,
    durationSeconds,
    errorMsg
  });

  const { variables: variableList } = getAppChatConfig({
    chatConfig: appChatConfig,
    systemConfigNode: getGuideModule(nodes),
    isPublicFetch: false
  });

  let finalInteractive = extractDeepestInteractive(interactiveValue.interactive);

  if (finalInteractive.type === 'userSelect') {
    finalInteractive.params.userSelectedVal = parsedUserInteractiveVal;
  } else if (
    finalInteractive.type === 'userInput' &&
    typeof parsedUserInteractiveVal === 'object'
  ) {
    finalInteractive.params.inputForm = finalInteractive.params.inputForm.map((item) => {
      const itemValue = parsedUserInteractiveVal[item.key];
      if (itemValue === undefined) return item;

      // 如果是密码类型，加密后存储
      if (item.type === FlowNodeInputTypeEnum.password) {
        const decryptedVal = anyValueDecrypt(itemValue);
        if (typeof decryptedVal === 'string') {
          return {
            ...item,
            value: encryptSecretValue({
              value: decryptedVal,
              secret: ''
            } as SecretValueType)
          };
        }
        return {
          ...item,
          value: itemValue
        };
      }

      return {
        ...item,
        value: itemValue
      };
    });
    finalInteractive.params.submitted = true;
  } else if (finalInteractive.type === 'paymentPause') {
    chatItem.value.pop();
  }

  if (aiResponse.customFeedbacks) {
    chatItem.customFeedbacks = chatItem.customFeedbacks
      ? [...chatItem.customFeedbacks, ...aiResponse.customFeedbacks]
      : aiResponse.customFeedbacks;
  }
  if (aiResponse.value) {
    chatItem.value = chatItem.value ? [...chatItem.value, ...aiResponse.value] : aiResponse.value;
  }
  if (aiResponse.citeCollectionIds) {
    chatItem.citeCollectionIds = chatItem.citeCollectionIds
      ? [...chatItem.citeCollectionIds, ...aiResponse.citeCollectionIds]
      : aiResponse.citeCollectionIds;
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
          variables,
          updateTime: new Date()
        }
      },
      {
        session
      }
    );

    // Create chat item respones
    if (nodeResponses) {
      // Merge
      const lastResponse = await MongoChatItemResponse.findOneAndDelete({
        appId,
        chatId,
        chatItemDataId: chatItem.dataId
      })
        .sort({
          _id: -1
        })
        .lean()
        .session(session);

      const newResponses = lastResponse?.data
        ? // @ts-ignore
          mergeChatResponseData([lastResponse?.data, ...nodeResponses])
        : nodeResponses;

      await MongoChatItemResponse.create(
        newResponses.map((item) => ({
          teamId,
          appId,
          chatId,
          chatItemDataId: chatItem.dataId,
          data: item
        })),
        { session, ordered: true, ...writePrimary }
      );
    }

    await afterProcess({
      contents: [userContent, aiContent],
      variables,
      variableList,
      session
    });
  });

  // Push chat data logs
  try {
    const { fifteenMinutesAgo, errorCount, totalPoints, now } = await getChatDataLog({
      nodeResponses
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
          updateTime: now
        }
      },
      {
        ...writePrimary
      }
    );
  } catch (error) {
    addLog.error('update interactive chat log error', error);
  }
};
