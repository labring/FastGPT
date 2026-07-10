import type { NextApiRequest, NextApiResponse } from 'next';
import { sseErrRes, jsonRes } from '@fastgpt/service/common/response';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/chat/stream/constants';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import {
  getWorkflowEntryNodeIds,
  getMaxHistoryLimitFromNodes,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes,
  getLastInteractiveValue
} from '@fastgpt/global/core/workflow/runtime/utils';
import { streamSseEvent } from '@fastgpt/global/core/chat/stream/sse';
import { GPTMessages2Chats, chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import {
  type Props as SaveChatProps,
  failChatRound,
  finalizeChatRound,
  updateInteractiveChat
} from '@fastgpt/service/core/chat/saveChat';
import { preChatRound, type PreChatRoundResult } from '@fastgpt/service/core/chat/utils/prepare';
import { createGeneratedChatTitleSender } from '@fastgpt/service/core/chat/title';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';
import { authOutLinkChatStart } from '@/service/support/permission/auth/outLink';
import { recordAppUsage } from '@fastgpt/service/core/app/record/utils';
import { pushResult2Remote, addOutLinkUsage } from '@fastgpt/service/support/outLink/tools';
import { getUsageSourceByAuthType } from '@fastgpt/global/support/wallet/usage/tools';
import {
  concatHistories,
  removeAIResponseCite,
  removeEmptyUserInput
} from '@fastgpt/global/core/chat/utils';
import { updateApiKeyUsage } from '@fastgpt/service/support/openapi/tools';
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { type AuthOutLinkChatProps } from '@fastgpt/global/support/outLink/api';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { type AIChatItemType, type UserChatItemType } from '@fastgpt/global/core/chat/type';
import type { AuthResponseType } from '@fastgpt/global/openapi/core/chat/completion/api';
import { CompletionsPropsSchema } from '@fastgpt/global/openapi/core/chat/completion/api';
import { NextAPI } from '@/service/middleware/entry';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  serverGetWorkflowToolRunUserQuery,
  updateWorkflowToolInputByVariables
} from '@fastgpt/service/core/app/tool/workflowTool/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { rewriteNodeOutputByHistories } from '@fastgpt/global/core/workflow/runtime/utils';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { getWorkflowToolInputsFromStoreNodes } from '@fastgpt/global/core/app/tool/workflowTool/utils';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { LimitTypeEnum, teamFrequencyLimit } from '@fastgpt/service/common/api/frequencyLimit';
import { getIpFromRequest } from '@fastgpt/service/common/geo';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { updateChatGenerateStatus } from '@fastgpt/service/core/chat/chatGenerateStatus';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';
import {
  filterWorkflowFinalResponseData,
  getWorkflowFinalResponseData
} from '@/service/core/workflow/nodeResponse';
import { formatCompletionResponseContent } from '@/service/core/chat/utils';
import {
  createWorkflowStreamResponseContext,
  type WorkflowStreamResponseContext
} from '@fastgpt/service/core/workflow/utils/streamResponseContext';
import { authChatCompletionHeaderRequest } from '@/service/support/permission/auth/chatCompletion';

const logger = getLogger(LogCategories.MODULE.CHAT.ITEM);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { body: completionProps } = parseApiInput({ req, bodySchema: CompletionsPropsSchema });
  const {
    chatId,
    appId,
    customUid,
    outLinkAuthData,

    stream = false,
    showSkillReferences,
    messages = [],
    responseChatItemId = getNanoid(),
    metadata,
    authProxy
  } = completionProps;
  let { detail = false, retainDatasetCite = false, variables = {} } = completionProps;
  const shareId = outLinkAuthData?.shareId;
  const outLinkUid = outLinkAuthData?.outLinkUid;

  const startTime = Date.now();
  const originIp = getIpFromRequest(req);
  let streamResponseContext: WorkflowStreamResponseContext<false> | undefined;
  let titleSender: ReturnType<typeof createGeneratedChatTitleSender> | undefined;
  const roundState = {
    preparedRound: undefined as PreChatRoundResult | undefined,
    sourceId: undefined as string | undefined,
    chatId: undefined as string | undefined,
    responseChatItemId
  };

  try {
    if (!Array.isArray(messages)) {
      throw new Error('messages is not array');
    }

    /*
      Web params: chatId + [Human]
      API params: chatId + [Human]
      API params: [histories, Human]
    */
    const chatMessages = GPTMessages2Chats({ messages });

    // Computed start hook params
    const startHookText = (() => {
      // Chat
      const userQuestion = chatMessages[chatMessages.length - 1] as UserChatItemType;
      if (userQuestion) return chatValue2RuntimePrompt(userQuestion.value).text;

      // plugin
      return JSON.stringify(variables);
    })();

    /*
      1. auth app permission
      2. auth balance
      3. get app
      4. parse outLink token
    */
    const {
      teamId,
      tmbId,
      app,
      showCite,
      authType,
      sourceName,
      apikey,
      responseAllData,
      outLinkUserId = customUid,
      showRunningStatus,
      showSkillReferences: authShowSkillReferences
    } = await (async () => {
      // share chat
      if (shareId && outLinkUid) {
        if (authProxy) {
          return Promise.reject(ChatErrEnum.unAuthChat);
        }

        return authShareChat({
          shareId,
          outLinkUid,
          chatId,
          ip: originIp,
          question: startHookText
        });
      }

      /* parse req: api or token */
      return authChatCompletionHeaderRequest({
        req,
        appId,
        chatId,
        authProxy,
        showSkillReferences: true
      });
    })();

    if (
      !(await teamFrequencyLimit({
        teamId,
        type: LimitTypeEnum.chat,
        res
      }))
    ) {
      return;
    }

    pushTrack.teamChatQPM({ teamId });

    retainDatasetCite = retainDatasetCite && !!showCite;
    const finalShowSkillReferences =
      (showSkillReferences ?? authShowSkillReferences ?? false) && !!showRunningStatus;
    const isPlugin = app.type === AppTypeEnum.workflowTool;
    const pluginFixedTitle = isPlugin ? variables.cTime || formatTime2YMDHM(new Date()) : undefined;

    // Check message type
    if (isPlugin) {
      detail = true;
    } else {
      if (messages.length === 0) {
        throw new UserError('messages is empty');
      }
    }

    // Get obj=Human history
    const userQuestion: UserChatItemType = (() => {
      if (isPlugin) {
        return serverGetWorkflowToolRunUserQuery({
          pluginInputs: getWorkflowToolInputsFromStoreNodes(app.modules),
          variables,
          files: variables.files
        });
      }

      const latestHumanChat = chatMessages.pop() as UserChatItemType | undefined;
      if (!latestHumanChat) {
        throw new Error('User question is empty');
      }
      return latestHumanChat;
    })();

    // Get and concat history;
    const limit = getMaxHistoryLimitFromNodes(app.modules);
    const chatSource = {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: String(app._id)
    };
    const [{ histories }, { versionId, nodes, edges, chatConfig }, chatDetail] = await Promise.all([
      getChatItems({
        ...chatSource,
        chatId,
        offset: 0,
        limit,
        field: `obj value memories nodeOutputs`
      }),
      getAppLatestVersion(app._id, app),
      MongoChat.findOne(
        { ...buildChatSourceQuery(chatSource), chatId },
        'source variableList variables'
      )
    ]);

    // Get store variables(Api variable precedence)
    if (chatDetail?.variables) {
      variables = {
        ...chatDetail.variables,
        ...variables
      };
    }

    // Get chat histories
    const newHistories = concatHistories(histories, chatMessages);
    const interactive = getLastInteractiveValue(newHistories) || undefined;

    // Get runtimeNodes
    let runtimeNodes = storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes, interactive));
    if (isPlugin) {
      // Assign values to runtimeNodes using variables
      runtimeNodes = updateWorkflowToolInputByVariables(runtimeNodes, variables);
      // Plugin runtime does not need global variables(It has been injected into the pluginInputNode)
      variables = {};
    }
    runtimeNodes = rewriteNodeOutputByHistories(runtimeNodes, interactive);

    const source = (() => {
      if (shareId) {
        return ChatSourceEnum.share;
      }
      if (authType === 'apikey') {
        return ChatSourceEnum.api;
      }
      return ChatSourceEnum.online;
    })();

    const preparedRound = await preChatRound({
      ...chatSource,
      chatId,
      teamId,
      tmbId: String(tmbId),
      source,
      sourceName: sourceName || '',
      shareId,
      outLinkUid: outLinkUserId,
      userContent: userQuestion,
      responseChatItemId: roundState.responseChatItemId,
      interactive,
      fixedTitle: pluginFixedTitle
    });
    const saveChatId = preparedRound.chatId;
    const finalResponseChatItemId = preparedRound.responseChatItemId;
    const runningAppId = String(app._id);
    roundState.preparedRound = preparedRound;
    roundState.sourceId = runningAppId;
    roundState.chatId = saveChatId;
    roundState.responseChatItemId = finalResponseChatItemId;

    streamResponseContext = await createWorkflowStreamResponseContext({
      req,
      res,
      stream,
      detail,
      teamId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: runningAppId,
      chatId: saveChatId,
      responseId: saveChatId,
      showNodeStatus: showRunningStatus,
      enableStreamResume: false
    });
    const workflowResponseWrite = streamResponseContext.responseWrite;
    const shouldCollectFinalResponseData = detail || !!shareId;
    titleSender = createGeneratedChatTitleSender({
      titleGeneration: preparedRound.titleGeneration,
      stream,
      detail,
      writeChatTitle: (payload) => streamResponseContext?.responseWrite(payload)
    });
    if (stream) {
      void titleSender.start();
    }

    /* start flow controller */
    const {
      flowUsages,
      assistantResponses,
      newVariables,
      durationSeconds,
      system_memories,
      customFeedbacks,
      nodeResponseSummary,
      flatNodeResponses
    } = await dispatchWorkFlow({
      apiVersion: 'v1',
      req,
      res,
      lang: getLocale(req),
      requestOrigin: req.headers.origin,
      mode: 'chat',

      usageSource: getUsageSourceByAuthType({ shareId, authType }),
      runningAppInfo: {
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(app._id),
        name: app.name,
        teamId: String(app.teamId),
        tmbId: String(app.tmbId)
      },
      runningUserInfo: await getRunningUserInfoByTmbId(tmbId),
      uid: String(outLinkUserId || tmbId),

      chatId: saveChatId,
      responseChatItemId: finalResponseChatItemId,
      runtimeNodes,
      runtimeEdges: storeEdges2RuntimeEdges(edges, interactive),
      variables,
      query: removeEmptyUserInput(userQuestion.value),
      lastInteractive: interactive,
      chatConfig,
      histories: newHistories,
      stream,
      retainDatasetCite,
      showSkillReferences: finalShowSkillReferences,
      maxRunTimes: WORKFLOW_MAX_RUN_TIMES,
      workflowStreamResponse: workflowResponseWrite,
      nodeResponseWriteConfig: {
        persistToDb: preparedRound.shouldPersistChatRound,
        retainInMemory: shouldCollectFinalResponseData
      }
    });

    const aiResponse: AIChatItemType & { dataId?: string } = {
      dataId: finalResponseChatItemId,
      obj: ChatRoleEnum.AI,
      value: assistantResponses,
      memories: system_memories,
      customFeedbacks
    };

    const params: SaveChatProps = {
      ...chatSource,
      chatId: saveChatId,
      versionId,
      teamId,
      tmbId: tmbId,
      nodes,
      appChatConfig: chatConfig,
      variables: newVariables,
      shareId,
      outLinkUid: outLinkUserId,
      source,
      sourceName: sourceName || '',
      userContent: userQuestion,
      aiContent: aiResponse,
      metadata: {
        ...metadata,
        originIp
      },
      durationSeconds,
      nodeResponseSummary
    };
    if (interactive) {
      await updateInteractiveChat({
        interactive,
        shouldFinalizePreparedRound: preparedRound.shouldFinalizePreparedRound,
        ...params
      });
    } else if (preparedRound.shouldFinalizePreparedRound) {
      await finalizeChatRound(params);
    }

    if (!preparedRound.shouldFinalizePreparedRound && preparedRound.shouldPersistChatRound) {
      await updateChatGenerateStatus({
        ...chatSource,
        chatId: saveChatId,
        status: ChatGenerateStatusEnum.done
      });
    }
    const isOwnerUse = !shareId;
    if (isOwnerUse && source === ChatSourceEnum.online) {
      await recordAppUsage({
        appId: app._id,
        tmbId,
        teamId
      });
    }

    logger.info(`completions running time: ${(Date.now() - startTime) / 1000}s`);

    /* select fe response field */
    const finalResponseData = getWorkflowFinalResponseData({
      flatNodeResponses,
      shouldCollect: shouldCollectFinalResponseData
    });
    const feResponseData = filterWorkflowFinalResponseData({
      responseData: finalResponseData,
      responseAllData,
      responseDetail: showCite
    });
    if (stream) {
      await titleSender.send();
      titleSender.close();

      workflowResponseWrite(streamSseEvent.answerStop());
      // 特殊输配(data 不是{})
      if (detail) {
        workflowResponseWrite(
          streamSseEvent.raw({
            event: SseResponseEventEnum.flowResponses,
            data: JSON.stringify(feResponseData)
          })
        );
      }

      workflowResponseWrite(streamSseEvent.done(detail ? SseResponseEventEnum.answer : undefined));
    } else {
      const generatedTitle = await titleSender.send();
      const formatResponseContent = removeAIResponseCite(assistantResponses, retainDatasetCite);
      const formattdResponse = formatCompletionResponseContent({
        responseContent: formatResponseContent,
        detail
      });

      const error =
        nodeResponseSummary?.lastError ||
        finalResponseData[finalResponseData.length - 1]?.error ||
        finalResponseData[finalResponseData.length - 1]?.errorText;

      res.json({
        ...(detail ? { responseData: feResponseData, newVariables } : {}),
        title: generatedTitle,
        error,
        id: saveChatId,
        model: '',
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 1 },
        choices: [
          {
            message: {
              role: 'assistant',
              ...(Array.isArray(formattdResponse)
                ? { content: formattdResponse }
                : {
                    content: formattdResponse.content,
                    ...(formattdResponse.reasoning && {
                      reasoning_content: formattdResponse.reasoning
                    })
                  })
            },
            finish_reason: 'stop',
            index: 0
          }
        ]
      });
    }

    const totalPoints = flowUsages.reduce((sum, item) => sum + (item.totalPoints || 0), 0);
    if (shareId) {
      pushResult2Remote({
        outLinkUid,
        shareId,
        appName: app.name,
        flowResponses: finalResponseData,
        chatId: saveChatId
      });
      addOutLinkUsage({
        shareId,
        totalPoints
      });
    }
    if (apikey) {
      updateApiKeyUsage({
        apikey,
        totalPoints
      });
    }
  } catch (err) {
    const { preparedRound } = roundState;
    if (preparedRound?.shouldPersistChatRound && roundState.sourceId && roundState.chatId) {
      if (preparedRound.shouldFinalizePreparedRound) {
        await failChatRound({
          sourceType: ChatSourceTypeEnum.app,
          sourceId: roundState.sourceId,
          chatId: roundState.chatId,
          responseChatItemId: roundState.responseChatItemId,
          error: err
        });
      } else {
        await updateChatGenerateStatus({
          sourceType: ChatSourceTypeEnum.app,
          sourceId: roundState.sourceId,
          chatId: roundState.chatId,
          status: ChatGenerateStatusEnum.error
        });
      }
    }
    if (stream) {
      titleSender?.close();
      if (streamResponseContext) {
        streamResponseContext.writeStreamError(err);
      } else {
        sseErrRes(res, err);
      }
    } else {
      jsonRes(res, {
        code: 500,
        error: err
      });
    }
  } finally {
    if (stream) {
      res.end();
    }
  }
}
export default NextAPI(handler);

const authShareChat = async ({
  chatId,
  ...data
}: AuthOutLinkChatProps & {
  shareId: string;
  chatId?: string;
}): Promise<AuthResponseType> => {
  const {
    teamId,
    tmbId,
    appId,
    authType,
    showCite,
    showRunningStatus,
    showSkillReferences,
    uid,
    sourceName
  } = await authOutLinkChatStart(data);
  const app = await MongoApp.findById(appId).lean();

  if (!app) {
    return Promise.reject('app is empty');
  }

  // get chat
  const chat = await MongoChat.findOne({
    ...buildChatSourceQuery({ sourceType: ChatSourceTypeEnum.app, sourceId: String(appId) }),
    chatId
  }).lean();
  if (chat && (chat.shareId !== data.shareId || chat.outLinkUid !== uid)) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  return {
    sourceName,
    teamId,
    tmbId,
    app,
    apikey: '',
    authType,
    responseAllData: false,
    showCite,
    outLinkUserId: uid,
    showRunningStatus,
    showSkillReferences
  };
};
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb'
    },
    responseLimit: '20mb'
  }
};
