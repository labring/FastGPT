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
import { getModuleFileAmountLimit } from '@fastgpt/global/core/workflow/fileLimit';
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
import { loadWorkflowResourceContext } from '../../../core/workflow/utils/resource';
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
import {
  filterWorkflowQueryFiles,
  getWorkflowFileLimits
} from '../../../core/workflow/utils/fileLimits';
import { MongoChat } from '../../../core/chat/chatSchema';
import { buildChatSourceQuery, type ChatSourceParams } from '../../../core/chat/source';
import { MongoChatItem } from '../../../core/chat/chatItemSchema';
import { getRunningUserInfoByTmbId, getUserIdByTmbId } from '../../../support/user/team/utils';
import { addOutLinkUsage } from '../../../support/outLink/tools';
import { getLogger, LogCategories } from '../../../common/logger';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { authOutLinkLimit } from './auth';
import { assertCancellation } from '../../user/account/cancellation/guard';
import type {
  OutlinkMessageHandleResult,
  OutlinkProviderMessageHandler,
  OutlinkMessage,
  OutlinkResponder,
  OutlinkResponseEvent,
  RunOutlinkRuntimeProps
} from './type';

const logger = getLogger(LogCategories.MODULE.OUTLINK);

// Chat reset commands.
const RESET_CHAT_INPUT = new Set(['Reset', '/reset']);
const CITED_TEXT_PATTERN = /<Cite>[\s\S]*?<\/Cite>/g;
const RESET_CHAT_REPLY = '对话已重置。\n\nThe chat records have been reset.';
const DEFAULT_REPLY = 'This is default reply';

/** Detects reset commands after providers merge quoted text into the current query. */
const isResetChatCommand = (query: UserChatItemType['value']) => {
  const content = query
    .flatMap((item) => (item.text?.content ? [item.text.content] : []))
    .join('\n')
    .trim();
  if (RESET_CHAT_INPUT.has(content)) return true;

  return RESET_CHAT_INPUT.has(content.replace(CITED_TEXT_PATTERN, '').trim());
};
const DEFAULT_RESPONSE_START_TIMEOUT_MS = 30000;

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
  let startPushed = false;
  let startHandled = false;
  let startTimeout: ReturnType<typeof setTimeout> | undefined;
  let resolveStartResult!: (result: RespondResult) => void;
  let resolveResult!: (result: RespondResult) => void;
  const startResult = new Promise<RespondResult>((resolve) => {
    resolveStartResult = resolve;
  });
  const result = new Promise<RespondResult>((resolve) => {
    resolveResult = resolve;
  });
  let resultHandled = false;
  const settleResult = (result: RespondResult) => {
    if (resultHandled) return;
    resultHandled = true;
    resolveResult(result);
  };
  const settleStart = (result: RespondResult) => {
    if (startHandled) return;
    startHandled = true;
    if (startTimeout) clearTimeout(startTimeout);
    resolveStartResult(result);
  };
  const events = (async function* () {
    for await (const event of stream as AsyncIterable<OutlinkResponseEvent>) {
      yield event;
      // This runs when a sequential consumer finishes handling start and requests the next event.
      if (event.type === 'start') settleStart({ success: true });
    }
  })();
  const finish = (result: RespondResult) => {
    if (startPushed && !startHandled) {
      const startFailure: RespondResult = result.success
        ? { success: false, error: new Error('Outlink responder ended during start') }
        : result;
      settleStart(startFailure);
      if (!terminal) {
        terminal = true;
        stream.destroy();
      }
      settleResult(startFailure);
      return startFailure;
    }

    if (!result.success && !terminal) {
      terminal = true;
      stream.destroy();
    }

    settleResult(result);
    return result;
  };
  void Promise.resolve()
    .then(() => respond(events))
    .then<RespondResult>(() => finish({ success: true }))
    .catch<RespondResult>((error) => finish({ success: false, error }));

  return {
    push(event: OutlinkResponseEvent) {
      if (terminal) return;
      if (event.type === 'start') {
        startPushed = true;
        startTimeout = setTimeout(() => {
          finish({ success: false, error: new Error('Outlink responder start timeout') });
        }, respond.startTimeoutMs ?? DEFAULT_RESPONSE_START_TIMEOUT_MS);
      }
      stream.push(event);
      if (event.type === 'done' || event.type === 'error') {
        terminal = true;
        stream.push(null);
      }
    },
    get terminal() {
      return terminal;
    },
    startResult,
    result
  };
};

/** Starts one provider task and sends its terminal error through the provider responder. */
export const dispatchOutlinkProviderMessage = <T extends OutlinkAppType>({
  onMessage,
  outLinkConfig,
  message,
  respond,
  errorContent = '文件处理失败，请稍后重试',
  onProcessingError,
  onResponseError,
  onMessageResult
}: Omit<RunOutlinkRuntimeProps<T>, 'message'> & {
  onMessage: OutlinkProviderMessageHandler<T>;
  message: OutlinkMessage | undefined | Promise<OutlinkMessage | undefined>;
  errorContent?: string;
  onProcessingError: (error: unknown) => void;
  onResponseError: (error: unknown) => void;
  onMessageResult?: (result: OutlinkMessageHandleResult) => void | Promise<void>;
}) => {
  void (async () => {
    try {
      const normalizedMessage = await message;
      if (!normalizedMessage) return;
      const result = await onMessage({ outLinkConfig, message: normalizedMessage, respond });
      await onMessageResult?.(result);
    } catch (error) {
      onProcessingError(error);
      await respond(Readable.from([{ type: 'error', content: errorContent }]));
    }
  })().catch(onResponseError);
};

/**
 * Runs a platform-agnostic outlink chat and bridges synchronous workflow events into an ordered
 * response stream.
 */
export async function runOutlinkRuntime<T extends OutlinkAppType>({
  outLinkConfig,
  message: { chatId, query, messageId, chatUserId, resolveQuery },
  respond
}: RunOutlinkRuntimeProps<T>): Promise<OutlinkMessageHandleResult> {
  // 分享链接没有用户 Session，使用发布链接绑定的 tmb/team 校验账号可用性
  await assertCancellation({
    teamId: String(outLinkConfig.teamId),
    userId: await getUserIdByTmbId(String(outLinkConfig.tmbId))
  });

  const roundState = {
    preparedRound: undefined as PreChatRoundResult | undefined,
    sourceId: '',
    finalized: false
  };
  let responseController: ReturnType<typeof createResponseController> | undefined;

  try {
    // Load the published app and its latest workflow config in parallel.
    const [app, workflowVersion] = await Promise.all([
      MongoApp.findById(outLinkConfig.appId).lean(),
      getAppLatestVersion(outLinkConfig.appId)
    ]);
    const { nodes, chatConfig, edges, resources } = workflowVersion;

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
    if (isResetChatCommand(query)) {
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
      return { status: 'handled' };
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
    if (histories.find((item) => item.dataId === messageId)) {
      return { status: 'duplicate' };
    }

    await authOutLinkLimit({
      outLinkUid: chatUserId,
      outLink: outLinkConfig as OutLinkSchemaType,
      question: userQuestion
    });

    const workflowFileLimits = await getWorkflowFileLimits({
      teamId: String(outLinkConfig.teamId)
    });
    const queryMaxFileAmount = getModuleFileAmountLimit({
      userMaxFileAmount: workflowFileLimits.maxFileAmount,
      moduleMaxFileAmount: chatConfig.fileSelectConfig?.maxFiles
    });

    // Start platform output only after idempotency and limit checks pass.
    responseController = createResponseController(respond);
    responseController.push({ type: 'start' });
    const startResult = await responseController.startResult;
    if (!startResult.success) throw startResult.error;

    // Keep the workflow callback synchronous; the response stream serializes platform I/O.
    const workflowStreamResponse: WorkflowResponseType = (event) => {
      const content = getAnswerChunkText(event);
      if (content) responseController?.push({ type: 'chunk', content });
    };

    // Resume global variables saved by previous chat rounds.
    const variables = chatDetail?.variables ?? {};
    const resolvedQuery = resolveQuery
      ? await resolveQuery({
          maxFileAmount: queryMaxFileAmount,
          maxBytesPerFile: workflowFileLimits.maxBytesPerFile,
          fileSelectConfig: chatConfig.fileSelectConfig ?? {}
        })
      : query;
    const workflowQuery = filterWorkflowQueryFiles({
      query: resolvedQuery,
      maxFileAmount: queryMaxFileAmount
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
      resourceContext: await loadWorkflowResourceContext({
        resources,
        teamId: app.teamId
      }),
      variables,
      histories,
      query: workflowQuery,
      maxFileAmount: workflowFileLimits.maxFileAmount,
      maxBytesPerFile: workflowFileLimits.maxBytesPerFile,
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
    return { status: 'handled' };
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
    return { status: 'handled' };
  }
}
