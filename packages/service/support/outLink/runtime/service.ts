import { Readable } from 'node:stream';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import type { UserChatItemType } from '@fastgpt/global/core/chat/type';
import {
  getWorkflowEntryNodeIds,
  getMaxHistoryLimitFromNodes,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  WorkflowResponseItemType,
  WorkflowResponseType
} from '@fastgpt/global/core/workflow/runtime/sse';
import { getErrResponse, getErrText } from '@fastgpt/global/common/error/utils';
import { getUsageSourceByPublishChannel } from '@fastgpt/global/support/wallet/usage/tools';
import {
  getChatSourceByPublishChannel,
  removeAIResponseCite
} from '@fastgpt/global/core/chat/utils';
import type { OutlinkAppType, OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import { getAppLatestVersion } from '../../../core/app/version/controller';
import { MongoApp } from '../../../core/app/schema';
import { getChatItems } from '../../../core/chat/controller';
import {
  failChatRound,
  finalizeChatRound,
  type Props as SaveChatProps
} from '../../../core/chat/saveChat';
import { preChatRound, type PreChatRoundResult } from '../../../core/chat/utils/prepare';
import { updateChatGenerateStatus } from '../../../core/chat/chatGenerateStatus';
import { dispatchWorkFlow } from '../../../core/workflow/dispatch';
import { WORKFLOW_MAX_RUN_TIMES } from '../../../core/workflow/constants';
import { prepareWorkflowFileQuery } from '../../../core/workflow/utils/fileLimits';
import { MongoChat } from '../../../core/chat/chatSchema';
import { buildChatSourceQuery, type ChatSourceParams } from '../../../core/chat/source';
import { MongoChatItem } from '../../../core/chat/chatItemSchema';
import { getRunningUserInfoByTmbId } from '../../../support/user/team/utils';
import { addOutLinkUsage } from '../../../support/outLink/tools';
import { getLogger, LogCategories } from '../../../common/logger';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { authOutLinkLimit } from './auth';
import type { OutlinkResponder, OutlinkResponseEvent, RunOutlinkRuntimeProps } from './type';

const logger = getLogger(LogCategories.MODULE.OUTLINK);

// Chat reset commands.
const RESET_CHAT_INPUT: Record<string, boolean> = {
  Reset: true,
  '/reset': true
};
const RESET_CHAT_REPLY = '对话已重置。\n\nThe chat records have been reset.';
const DEFAULT_REPLY = 'This is default reply';

/**
 * Resets an outlink conversation for the specified chat source.
 *
 * This function rewrites chat and chat item records, so callers must pass the domain-level
 * `sourceType` and `sourceId` instead of treating every source ID as an app ID.
 */
export const resetChat = ({
  sourceType,
  sourceId,
  chatId
}: ChatSourceParams & { chatId: string }) => {
  const newChatId = getNanoid(26);
  const chatSourceQuery = buildChatSourceQuery({ sourceType, sourceId });

  return mongoSessionRun(async (session) => {
    await MongoChat.updateOne(
      { ...chatSourceQuery, chatId },
      { $set: { chatId: newChatId } },
      { session }
    );
    await MongoChatItem.updateMany(
      { ...chatSourceQuery, chatId },
      { $set: { chatId: newChatId } },
      { session }
    );
  });
};

type RespondResult = { success: true } | { success: false; error: unknown };

/**
 * Extract answer text from workflow.
 */
const getAnswerChunkText = ({ event, data }: WorkflowResponseItemType) => {
  if (event !== SseResponseEventEnum.answer && event !== SseResponseEventEnum.fastAnswer) {
    return null;
  }

  const text = (data as Record<string, any>).choices?.[0]?.delta?.content;

  return typeof text === 'string'
    ? // Checked string.
      (text as string)
    : null;
};

/**
 * Creates a single-consumer response stream and captures responder errors immediately to avoid
 * unhandled rejections from background promises.
 */
const createResponseController = (respond: OutlinkResponder) => {
  const stream = new Readable({
    objectMode: true,
    read() {}
  });
  let terminal = false;
  const result = Promise.resolve()
    .then(() => respond(stream as AsyncIterable<OutlinkResponseEvent>))
    .then<RespondResult>(() => ({ success: true }))
    .catch<RespondResult>((error) => ({ success: false, error }));

  return {
    push(event: OutlinkResponseEvent) {
      if (terminal) return;
      stream.push(event);
      if (event.type === 'done' || event.type === 'error') {
        terminal = true;
        stream.push(null);
      }
    },
    get terminal() {
      return terminal;
    },
    result
  };
};

/**
 * Runs a platform-agnostic outlink chat and bridges synchronous workflow events into an ordered
 * response stream.
 *
 * @todo Remove the legacy runtime after all providers migrate to this runtime.
 */
export async function runOutlinkRuntime<T extends OutlinkAppType>({
  outLinkConfig,
  message: { chatId, query, messageId, chatUserId },
  respond
}: RunOutlinkRuntimeProps<T>) {
  const roundState = {
    preparedRound: undefined as PreChatRoundResult | undefined,
    sourceId: '',
    finalized: false
  };
  let responseController: ReturnType<typeof createResponseController> | undefined;

  try {
    // Load the published app and its latest workflow config in parallel.
    const [app, { nodes, chatConfig, edges }] = await Promise.all([
      MongoApp.findById(outLinkConfig.appId).lean(),
      getAppLatestVersion(outLinkConfig.appId)
    ]);

    if (!nodes || !chatConfig || !app) {
      return Promise.reject('Invalid chat');
    }
    const chatSource = {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: String(app._id)
    };
    const userQuestion = query.find((item) => item.text)?.text?.content ?? '';

    // * Chat reset
    // Move existing records to a new chat ID so the next message starts a fresh conversation.
    if (RESET_CHAT_INPUT[userQuestion]) {
      await resetChat({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: outLinkConfig.appId,
        chatId
      });
      responseController = createResponseController(respond);
      responseController.push({ type: 'done', content: RESET_CHAT_REPLY });
      const result = await responseController.result;
      if (!result.success) {
        logger.error('Outlink reset responder failed', {
          shareId: outLinkConfig.shareId,
          chatId,
          messageId,
          error: getErrResponse(result.error)
        });
      }
      return;
    }

    // Load chat history and stored global variables in parallel.
    const [{ histories }, chatDetail] = await Promise.all([
      getChatItems({
        ...chatSource,
        chatId,
        offset: 0,
        limit: getMaxHistoryLimitFromNodes(nodes),
        field: `obj value`
      }),
      MongoChat.findOne(
        { ...buildChatSourceQuery(chatSource), chatId },
        'source variableList variables'
      )
    ]);

    // Ignore provider retries before consuming limits or starting platform output.
    if (histories.find((item) => item.dataId === messageId)) return;

    await authOutLinkLimit({
      outLinkUid: chatUserId,
      outLink: outLinkConfig as OutLinkSchemaType,
      question: userQuestion,
      ip: chatId
    });

    // Start platform output only after idempotency and limit checks pass.
    responseController = createResponseController(respond);
    responseController.push({ type: 'start' });

    // Keep the workflow callback synchronous; the response stream serializes platform I/O.
    const workflowStreamResponse: WorkflowResponseType = (event) => {
      const content = getAnswerChunkText(event);
      if (content) responseController?.push({ type: 'chunk', content });
    };

    // Resume global variables saved by previous chat rounds.
    const variables = chatDetail?.variables ?? {};
    const {
      query: workflowQuery,
      maxFileAmount,
      maxBytesPerFile
    } = await prepareWorkflowFileQuery({
      teamId: String(outLinkConfig.teamId),
      chatConfig,
      query
    });
    const userContent: UserChatItemType & { dataId?: string } = {
      dataId: messageId,
      obj: ChatRoleEnum.Human,
      value: workflowQuery
    };
    const preparedRound = await preChatRound({
      ...chatSource,
      chatId,
      teamId: String(outLinkConfig.teamId),
      tmbId: String(outLinkConfig.tmbId),
      source: getChatSourceByPublishChannel(outLinkConfig.type),
      sourceName: outLinkConfig.name,
      shareId: outLinkConfig.shareId,
      outLinkUid: chatUserId,
      userContent,
      responseChatItemId: messageId
    });
    roundState.preparedRound = preparedRound;
    roundState.sourceId = chatSource.sourceId;

    const {
      assistantResponses,
      newVariables,
      flowUsages,
      durationSeconds,
      system_memories,
      nodeResponseSummary
    } = await dispatchWorkFlow({
      apiVersion: 'v2',
      mode: 'chat',
      usageSource: getUsageSourceByPublishChannel(outLinkConfig.type),
      runningAppInfo: {
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(app._id),
        name: app.name,
        teamId: app.teamId,
        tmbId: app.tmbId
      },
      runningUserInfo: await getRunningUserInfoByTmbId(app.tmbId),
      uid: chatUserId || outLinkConfig.tmbId,
      chatId: preparedRound.chatId,
      responseChatItemId: preparedRound.responseChatItemId,
      variables,
      histories,
      query: workflowQuery,
      maxFileAmount,
      maxBytesPerFile,
      chatConfig,
      stream: true,
      workflowStreamResponse,
      runtimeEdges: storeEdges2RuntimeEdges(edges),
      runtimeNodes: storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes)),
      maxRunTimes: WORKFLOW_MAX_RUN_TIMES,
      retainDatasetCite: false,
      nodeResponseWriteConfig: {
        persistToDb: true,
        retainInMemory: false
      }
    });

    // The terminal event carries the authoritative full reply for final correction or delivery.
    const responseContent =
      removeAIResponseCite(assistantResponses, false)
        .map((response) => response.text?.content)
        .filter(Boolean)
        .join('\n')
        .trim() || DEFAULT_REPLY;

    responseController.push({ type: 'done', content: responseContent });
    // Wait for delivery so responder failures can be persisted with the final chat round.
    const respondResult = await responseController.result;
    if (!respondResult.success) {
      logger.error('Outlink responder failed', {
        shareId: outLinkConfig.shareId,
        chatId,
        messageId,
        error: getErrResponse(respondResult.error)
      });
    }

    // Save the completed chat round together with its platform delivery status.
    const saveParams: SaveChatProps = {
      ...chatSource,
      chatId: preparedRound.chatId,
      teamId: outLinkConfig.teamId,
      tmbId: outLinkConfig.tmbId,
      outLinkUid: chatUserId,
      nodes,
      appChatConfig: chatConfig,
      variables: newVariables,
      shareId: outLinkConfig.shareId,
      source: getChatSourceByPublishChannel(outLinkConfig.type),
      sourceName: outLinkConfig.name,
      userContent,
      aiContent: {
        dataId: preparedRound.responseChatItemId,
        obj: ChatRoleEnum.AI,
        value: assistantResponses,
        memories: system_memories
      },
      metadata: {},
      durationSeconds,
      errorMsg: respondResult.success ? undefined : getErrText(respondResult.error),
      nodeResponseSummary
    };
    await finalizeChatRound(saveParams);
    roundState.finalized = true;

    const totalPoints = flowUsages.reduce((sum, item) => sum + (item.totalPoints || 0), 0);
    addOutLinkUsage({ shareId: outLinkConfig.shareId, totalPoints });
  } catch (error) {
    const { preparedRound } = roundState;
    if (!roundState.finalized && preparedRound?.shouldPersistChatRound && roundState.sourceId) {
      if (preparedRound.shouldFinalizePreparedRound) {
        await failChatRound({
          sourceType: ChatSourceTypeEnum.app,
          sourceId: roundState.sourceId,
          chatId: preparedRound.chatId,
          responseChatItemId: preparedRound.responseChatItemId,
          error
        }).catch((saveError) => {
          logger.error('Outlink runtime mark error failed', {
            shareId: outLinkConfig.shareId,
            chatId,
            messageId,
            error: saveError
          });
        });
      } else {
        await updateChatGenerateStatus({
          sourceType: ChatSourceTypeEnum.app,
          sourceId: roundState.sourceId,
          chatId: preparedRound.chatId,
          status: ChatGenerateStatusEnum.error
        }).catch((saveError) => {
          logger.error('Outlink runtime unlock failed', {
            shareId: outLinkConfig.shareId,
            chatId,
            messageId,
            error: saveError
          });
        });
      }
    }

    logger.error('Outlink runtime failed', {
      shareId: outLinkConfig.shareId,
      chatId,
      messageId,
      error
    });

    responseController ??= createResponseController(respond);
    if (!responseController.terminal) {
      responseController.push({ type: 'error', content: `App run error: ${getErrText(error)}` });
    }
    const result = await responseController.result;
    if (!result.success) {
      logger.error('Outlink error responder failed', {
        shareId: outLinkConfig.shareId,
        chatId,
        messageId,
        error: getErrResponse(result.error)
      });
    }
  }
}
