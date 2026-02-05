import type {
  AIChatItemType,
  ChatHistoryItemResType,
  UserChatItemType
} from '@fastgpt/global/core/chat/type';
import type { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { MongoChatItem } from './chatItemSchema';
import { MongoChat } from './chatSchema';
import { addLog } from '../../common/system/log';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { type StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getAppChatConfig, getGuideModule } from '@fastgpt/global/core/workflow/utils';
import { type AppChatConfigType, type VariableItemType } from '@fastgpt/global/core/app/type';
import {
  checkInteractiveResponseStatus,
  mergeChatResponseData
} from '@fastgpt/global/core/chat/utils';
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
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { getFlatAppResponses } from '@fastgpt/global/core/chat/utils';

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
    if (item.file?.key) {
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
          if ('file' in valueItem && valueItem.file?.key) {
            keys.push(valueItem.file.key);
          }

          // 2. plugin input
          if ('text' in valueItem && valueItem.text?.content) {
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

  const dealResponseData = (responseItem: ChatHistoryItemResType) => {
    if (responseItem.moduleType === FlowNodeTypeEnum.datasetSearchNode && responseItem.quoteList) {
      // @ts-ignore
      responseItem.quoteList = responseItem.quoteList.map((quote) => {
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
      });
    }
  };
  getFlatAppResponses(responseData || []).forEach(dealResponseData);

  return {
    aiResponse: {
      ...aiResponse,
      durationSeconds,
      errorMsg,
      citeCollectionIds: Array.from(citeCollectionIds)
    },
    nodeResponses: responseData,
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

export const pushChatRecords = async (props: Props) => {
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

      // Count errors in current response
      const currentErrorCount = nodeResponses?.filter((item) => item.errorText).length ?? 0;

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
          },
          ...(currentErrorCount > 0 && { $inc: { errorCount: currentErrorCount } })
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
    addLog.error(`Save chat history error`, error);
  }
};

/* 
  更新交互节点，包含两种情况：
  1. 更新当前的 items，并把 value 追加到当前 items
  2. 新增 items, 次数只需要改当前的 items 里的交互节点值即可，其他属性追加在新增的 items 里
*/
export const updateInteractiveChat = async ({
  interactive,
  ...props
}: Props & {
  interactive: WorkflowInteractiveResponseType;
}) => {
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

  const { variables: variableList } = getAppChatConfig({
    chatConfig: appChatConfig,
    systemConfigNode: getGuideModule(nodes),
    isPublicFetch: false
  });

  const chatItem = await MongoChatItem.findOne({ appId, chatId, obj: ChatRoleEnum.AI }).sort({
    _id: -1
  });

  if (!chatItem || chatItem.obj !== ChatRoleEnum.AI) return;

  // Get interactive value
  interactive.params = interactive.params || {};

  // Get interactive response
  const { text: userInteractiveVal } = chatValue2RuntimePrompt(userContent.value);

  // 如果是发送一条新的 user 消息，则直接用推送记录的方式
  const status = checkInteractiveResponseStatus({
    interactive,
    input: userInteractiveVal
  });
  if (status === 'query') {
    return await pushChatRecords(props);
  }

  const parsedUserInteractiveVal = (() => {
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

  /* 
    在原来 chat_items 上更新。
    1. 更新交互响应结果
    2. 合并 chat_item 数据
    3. 合并 chat_item_response 数据
  */
  // Update interactive value
  {
    // 提取嵌套在子流程里的交互节点
    const finalInteractive = extractDeepestInteractive(interactive);

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
    } else if (finalInteractive.type === 'agentPlanCheck') {
      finalInteractive.params.confirmed = true;
    }

    // 将最新的 interactive 赋值给最后一条消息（最后一条必然是带交互的消息）
    chatItem.value[chatItem.value.length - 1].interactive = interactive;
  }

  // Update current items
  {
    if (aiContent.customFeedbacks) {
      chatItem.customFeedbacks = chatItem.customFeedbacks
        ? [...chatItem.customFeedbacks, ...aiContent.customFeedbacks]
        : aiContent.customFeedbacks;
    }
    if (aiContent.value) {
      chatItem.value = chatItem.value ? [...chatItem.value, ...aiContent.value] : aiContent.value;
    }
    if (aiResponse.citeCollectionIds) {
      chatItem.citeCollectionIds = chatItem.citeCollectionIds
        ? [...chatItem.citeCollectionIds, ...aiResponse.citeCollectionIds]
        : aiResponse.citeCollectionIds;
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

    // Create chat item respones
    if (nodeResponses) {
      /* 
        Merge with last response data
        如果是从嵌套的 node 里触发的交互，这里需要进行一个合并，否则会导致出现两次相同的 node（child response 无法合并起来）
      */
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
        ? mergeChatResponseData([lastResponse?.data, ...nodeResponses])
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
