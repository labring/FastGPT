import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import type { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { ChatGenerateStatusEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { MongoChatItem } from './chatItemSchema';
import { MongoChat } from './chatSchema';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { type StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getAppChatConfig, getGuideModule } from '@fastgpt/global/core/workflow/utils';
import { type AppChatConfigType, type VariableItemType } from '@fastgpt/global/core/app/type';
import { checkInteractiveResponseStatus } from '@fastgpt/global/core/chat/utils';
import { pushChatLog } from './pushChatLog';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { extractDeepestInteractive } from '@fastgpt/global/core/workflow/runtime/utils';
import { MongoAppChatLog } from '../app/logs/chatLogsSchema';
import { writePrimary } from '../../common/mongo/utils';
import { getLogger, LogCategories } from '../../common/logger';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import type { ClientSession } from '../../common/mongo';
import { removeS3TTL } from '../../common/s3/utils';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { encryptSecretValue, anyValueDecrypt } from '../../common/secret/utils';
import type { SecretValueType } from '@fastgpt/global/common/secret/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { normalizeChatFileStoreValues } from './fileStoreValue';
import type { NodeResponseWriteSummary } from './nodeResponseStorage';
import {
  getPreparedRoundDataIds,
  isSkipSaveChatId,
  stripUserContentFileUrls
} from './utils/prepare';

const logger = getLogger(LogCategories.MODULE.CHAT);

export type Props = {
  chatId: string;
  appId: string;
  versionId?: string;
  teamId: string;
  tmbId: string;
  nodes: StoreNodeItemType[];
  appChatConfig?: AppChatConfigType;
  variables?: Record<string, any>;
  source: `${ChatSourceEnum}`;
  sourceName?: string;
  shareId?: string;
  outLinkUid?: string;
  userContent: UserChatItemType & { dataId?: string };
  aiContent: AIChatItemType & { dataId?: string };
  metadata?: Record<string, any>;
  nodeResponseSummary?: NodeResponseWriteSummary;
  durationSeconds: number; //s
  errorMsg?: string;
};

const beforeProcess = (props: Props) => {
  // Remove url
  stripUserContentFileUrls(props.userContent);
};

/** 是否是文件对象，且包含 key */
const isFileValueWithKey = (file: unknown): file is { key: string } =>
  !!file && typeof file === 'object' && 'key' in file && typeof file.key === 'string' && !!file.key;

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
  // 移除 s3 ttl
  {
    const contentFileKeys = contents
      .map((item) => {
        if (item.value && Array.isArray(item.value)) {
          return item.value.flatMap((valueItem) => {
            const keys: string[] = [];

            // 1. chat file
            if ('file' in valueItem && valueItem.file?.key) {
              keys.push(valueItem.file.key);
            }

            // 2. query 是特殊格式的（工作流工具 + 表单输入）
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
                      fieldValue.forEach((file) => {
                        if (isFileValueWithKey(file)) {
                          keys.push(file.key);
                        }
                      });
                    }
                  });
                }
              } catch {}
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
            variableFileKeys.push(
              ...varValue
                .map((item) => (isFileValueWithKey(item) ? item.key : undefined))
                .filter((key): key is string => typeof key === 'string' && !!key)
            );
          }
        }
      });
    }

    const allFileKeys = [...new Set([...contentFileKeys, ...variableFileKeys])];

    if (allFileKeys.length > 0) {
      await removeS3TTL({ key: allFileKeys, bucketName: 'private', session });
    }
  }
};

const formatAiContent = ({
  aiContent,
  durationSeconds,
  errorMsg,
  nodeResponseSummary
}: {
  aiContent: AIChatItemType & { dataId?: string };
  durationSeconds: number;
  errorMsg?: string;
  nodeResponseSummary?: NodeResponseWriteSummary;
}) => {
  // nodeResponse 由 runtime writer 分批持久化；saveChat 只保存 AI 消息主体。
  const aiResponse = { ...aiContent };
  delete aiResponse.responseData;
  const errorCount = nodeResponseSummary?.errorCount ?? 0;

  return {
    aiResponse: {
      ...aiResponse,
      durationSeconds,
      errorMsg,
      citeCollectionIds: nodeResponseSummary?.citeCollectionIds || []
    },
    errorCount
  };
};

const getChatDataLog = async ({
  nodeResponseSummary
}: {
  nodeResponseSummary?: NodeResponseWriteSummary;
}) => {
  const now = new Date();
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

  const errorCount = nodeResponseSummary?.errorCount ? 1 : 0;
  const totalPoints = nodeResponseSummary?.totalPoints ?? 0;

  return {
    fifteenMinutesAgo,
    errorCount,
    totalPoints,
    now
  };
};

type FailChatRoundParams = {
  chatId: string;
  appId: string;
  responseChatItemId?: string;
  error: unknown;
};

/**
 * 完成一轮已经 prepare 的对话保存。
 *
 * preChatRound 会先创建 chat 记录和本轮 Human/AI 两条占位 chat items，并把会话标记为
 * generating。workflow 真正运行结束后，这里负责把占位 item 更新为最终消息内容、补齐
 * chat 的标题/变量/插件输入/统计信息，并把 chatGenerateStatus 改成 done。
 *
 * 这个方法只处理“已经预创建”的新运行轮次；未接入 prepare 的旧兼容路径仍由
 * pushChatRecords 单独处理。
 */
export const finalizeChatRound = async (props: Props) => {
  beforeProcess(props);

  const {
    chatId,
    appId,
    versionId,
    teamId,
    tmbId,
    nodes,
    appChatConfig,
    variables,
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

  if (isSkipSaveChatId(chatId)) return;

  const { welcomeText, variables: variableList } = getAppChatConfig({
    chatConfig: appChatConfig,
    systemConfigNode: getGuideModule(nodes),
    isPublicFetch: false
  });
  const pluginInputs = nodes?.find(
    (node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput
  )?.inputs;

  const { aiResponse, errorCount } = formatAiContent({
    aiContent,
    durationSeconds,
    errorMsg,
    nodeResponseSummary: props.nodeResponseSummary
  });
  const processedContent = [userContent, aiResponse];
  // dataId 来自 prepareChatRound 预创建的 Human/AI 占位 item，用它定位并补全本轮记录。
  const { humanDataId, aiDataId } = await getPreparedRoundDataIds({
    userContent,
    aiContent
  });
  const now = new Date();

  await mongoSessionRun(async (session) => {
    const chat = await MongoChat.findOne(
      {
        appId,
        chatId
      },
      '_id metadata'
    )
      .session(session)
      .lean();

    if (!chat) {
      throw new Error(`Pending chat round chat not found: ${chatId}`);
    }

    const metadataUpdate = {
      ...chat.metadata,
      ...metadata
    };

    // 这里不是新增 chat items，而是把 prepare 阶段创建的占位记录替换成最终内容。
    // obj 是 chat item 的角色标识，只用于查询定位，不在 finalize 阶段修改。
    const humanUpdate = { ...(processedContent[0] as Record<string, unknown>) };
    const aiUpdate = { ...(processedContent[1] as Record<string, unknown>) };
    delete humanUpdate.obj;
    delete aiUpdate.obj;

    const [humanDoc, aiDoc] = await Promise.all([
      MongoChatItem.findOneAndUpdate(
        { appId, chatId, dataId: humanDataId, obj: ChatRoleEnum.Human },
        {
          $set: humanUpdate
        },
        {
          session,
          new: true
        }
      ),
      MongoChatItem.findOneAndUpdate(
        { appId, chatId, dataId: aiDataId, obj: ChatRoleEnum.AI },
        {
          $set: aiUpdate
        },
        {
          session,
          new: true
        }
      )
    ]);

    if (!humanDoc || !aiDoc) {
      throw new Error(`Pending chat round items not found: ${chatId}`);
    }

    // chat 记录在 prepare 阶段已经存在，这里补齐运行结果相关的会话级字段并释放 generating 状态。
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
          source,
          sourceName,
          shareId,
          outLinkUid,
          metadata: metadataUpdate,
          updateTime: now,
          hasBeenRead: false,
          chatGenerateStatus: ChatGenerateStatusEnum.done
        },
        ...(errorCount > 0 && { $inc: { errorCount: errorCount } })
      },
      {
        session
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
      chatItemIdHuman: String(humanDoc._id),
      chatItemIdAi: String(aiDoc._id),
      appId
    });
  });

  // 统计日志不是主链路强依赖，失败只记录日志，不影响 chat item 和 chat 主数据保存。
  try {
    const { fifteenMinutesAgo, errorCount, totalPoints, now } = await getChatDataLog({
      nodeResponseSummary: props.nodeResponseSummary
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
    logger.error('Failed to push chat log', { chatId, error });
  }
};

export const failChatRound = async (params: FailChatRoundParams) => {
  const { chatId, appId, responseChatItemId, error } = params;

  if (isSkipSaveChatId(chatId)) return;

  try {
    const now = new Date();
    const errorMsg = getErrText(error);

    await mongoSessionRun(async (session) => {
      await MongoChat.updateOne(
        { appId, chatId },
        {
          $set: {
            chatGenerateStatus: ChatGenerateStatusEnum.error,
            updateTime: now,
            hasBeenRead: false
          }
        },
        {
          session
        }
      );

      if (responseChatItemId) {
        await MongoChatItem.updateOne(
          { appId, chatId, dataId: responseChatItemId, obj: ChatRoleEnum.AI },
          {
            $set: {
              errorMsg
            }
          },
          {
            session
          }
        );
      }
    });
  } catch (saveError) {
    logger.error('Failed to mark chat round as error', { chatId, error: saveError });
  }
};

export const pushChatRecords = async (props: Props) => {
  beforeProcess(props);

  const {
    chatId,
    appId,
    versionId,
    teamId,
    tmbId,
    nodes,
    appChatConfig,
    variables,
    source,
    sourceName,
    shareId,
    outLinkUid,
    userContent,
    aiContent,
    durationSeconds,
    errorMsg,
    nodeResponseSummary,
    metadata = {}
  } = props;

  if (!chatId || isSkipSaveChatId(chatId)) return;

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
    const { aiResponse, errorCount } = formatAiContent({
      aiContent,
      durationSeconds,
      errorMsg,
      nodeResponseSummary
    });
    const processedContent = [userContent, aiResponse];

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
            appVersionId: versionId,
            chatId,
            variableList,
            welcomeText,
            variables: variables || {},
            pluginInputs,
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
          ...(errorCount > 0 && { $inc: { errorCount: errorCount } })
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
        nodeResponseSummary
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
      logger.error('Failed to push chat log', { chatId, error });
    }
  } catch (error) {
    logger.error('Failed to update chat history', { chatId, error });
  }
};

/*
  更新交互节点，包含两种情况：
  1. 更新当前的 items，并把 value 追加到当前 items
  2. 新增 items, 次数只需要改当前的 items 里的交互节点值即可，其他属性追加在新增的 items 里
*/
export const updateInteractiveChat = async ({
  interactive,
  shouldFinalizePreparedRound = false,
  ...props
}: Props & {
  interactive: WorkflowInteractiveResponseType;
  shouldFinalizePreparedRound?: boolean;
}) => {
  beforeProcess(props);

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

  // 如果是发送一条新的 user 消息，必须由调用方提前 prepare 本轮 Human/AI 占位记录。
  const status = checkInteractiveResponseStatus({
    interactive,
    input: userInteractiveVal
  });
  // 提取嵌套在子流程里的交互节点
  const finalInteractive = extractDeepestInteractive(interactive);
  if (status === 'query') {
    if (!shouldFinalizePreparedRound) {
      throw new Error('Prepared chat round is required for interactive query');
    }

    if (finalInteractive.type === 'agentPlanAskQuery') {
      finalInteractive.params.answer = userInteractiveVal;

      const interactiveChatItem = await MongoChatItem.findOne({
        appId,
        chatId,
        obj: ChatRoleEnum.AI,
        'value.interactive': { $exists: true }
      }).sort({ _id: -1 });
      if (!interactiveChatItem || interactiveChatItem.obj !== ChatRoleEnum.AI) {
        throw new Error(`Interactive query chat item not found: ${chatId}`);
      }
      const previousInteractiveIndex = interactiveChatItem.value.findLastIndex(
        (item) => !!item.interactive
      );
      if (previousInteractiveIndex === -1) {
        throw new Error(`Interactive query value not found: ${chatId}`);
      }
      interactiveChatItem.value[previousInteractiveIndex].interactive = interactive;
      interactiveChatItem.markModified('value');
      await interactiveChatItem.save();

      props.userContent.value.forEach((item) => {
        item.planId = finalInteractive.planId;
      });
    }

    return finalizeChatRound(props);
  }

  const parsedUserInteractiveVal = (() => {
    try {
      return JSON.parse(userInteractiveVal);
    } catch {
      return userInteractiveVal;
    }
  })();
  const { aiResponse, errorCount } = formatAiContent({
    aiContent,
    durationSeconds,
    errorMsg,
    nodeResponseSummary: props.nodeResponseSummary
  });

  /*
    在原来 chat_items 上更新。
    1. 更新交互响应结果
    2. 合并 chat_item 数据
    3. 合并 chat_item_response 数据
  */
  // Update interactive value
  {
    if (finalInteractive.type === 'userSelect') {
      finalInteractive.params.userSelectedVal = userInteractiveVal;
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

        if (item.type === FlowNodeInputTypeEnum.fileSelect) {
          return {
            ...item,
            value: normalizeChatFileStoreValues(itemValue)
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
        },
        ...(errorCount > 0 && { $inc: { errorCount: errorCount } })
      },
      {
        session
      }
    );

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
      nodeResponseSummary: props.nodeResponseSummary
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
    logger.error('Failed to update interactive chat log', { chatId, error });
  }
};
