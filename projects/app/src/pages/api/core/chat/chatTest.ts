import type { NextApiRequest, NextApiResponse } from 'next';
import { sseErrRes } from '@fastgpt/service/common/response';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';
import { concatHistories, removeEmptyUserInput } from '@fastgpt/global/core/chat/utils';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  serverGetWorkflowToolRunUserQuery,
  updateWorkflowToolInputByVariables
} from '@fastgpt/service/core/app/tool/workflowTool/utils';
import { NextAPI } from '@/service/middleware/entry';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import {
  getLastInteractiveValue,
  getMaxHistoryLimitFromNodes,
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges,
  rewriteNodeOutputByHistories,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { getWorkflowToolInputsFromStoreNodes } from '@fastgpt/global/core/app/tool/workflowTool/utils';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';

import {
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import {
  failChatRound,
  finalizeChatRound,
  updateInteractiveChat
} from '@fastgpt/service/core/chat/saveChat';
import { preChatRound, type PreChatRoundResult } from '@fastgpt/service/core/chat/utils/prepare';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { LimitTypeEnum, teamFrequencyLimit } from '@fastgpt/service/common/api/frequencyLimit';
import { getIpFromRequest } from '@fastgpt/service/common/geo';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ChatTestPropsSchema } from '@fastgpt/global/openapi/core/chat/completion/api';
import { updateChatGenerateStatus } from '@fastgpt/service/core/chat/chatGenerateStatus';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  createWorkflowStreamResponseContext,
  type WorkflowStreamResponseContext
} from '@fastgpt/service/core/workflow/utils/streamResponseContext';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  let streamResponseContext: WorkflowStreamResponseContext | undefined;
  const chatTestProps = parseApiInput({ req, bodySchema: ChatTestPropsSchema }).body;

  const {
    nodes = [],
    edges = [],
    messages = [],
    responseChatItemId: responseChatItemIdFromBody,
    appName,
    appId,
    chatConfig,
    chatId
  } = chatTestProps;
  const roundState = {
    preparedRound: undefined as PreChatRoundResult | undefined,
    sourceId: undefined as string | undefined,
    chatId: undefined as string | undefined,
    responseChatItemId: responseChatItemIdFromBody ?? getNanoid(24)
  };
  let { variables = {} } = chatTestProps;
  const source = ChatSourceEnum.test;
  const originIp = getIpFromRequest(req);
  const chatMessages = GPTMessages2Chats({ messages });
  // console.log(JSON.stringify(chatMessages, null, 2), '====', chatMessages.length);

  try {
    /* user auth */
    const { app, teamId, tmbId } = await authApp({
      req,
      authToken: true,
      appId,
      per: ReadPermissionVal
    });

    // 类型获取
    const isPlugin = app.type === AppTypeEnum.workflowTool;
    const isTool = app.type === AppTypeEnum.tool;
    const pluginFixedTitle = isPlugin ? variables.cTime || formatTime2YMDHM(new Date()) : undefined;

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

    // 获取用户问题
    const userQuestion: UserChatItemType = await (async () => {
      if (isPlugin) {
        return serverGetWorkflowToolRunUserQuery({
          pluginInputs: getWorkflowToolInputsFromStoreNodes(nodes),
          variables,
          files: variables.files
        });
      }
      if (isTool) {
        return {
          obj: ChatRoleEnum.Human,
          value: [
            {
              text: { content: 'tool test' }
            }
          ]
        };
      }

      const latestHumanChat = chatMessages.pop() as UserChatItemType;
      if (!latestHumanChat) {
        throw new UserError('User question is empty');
      }
      return latestHumanChat;
    })();

    // 获取历史记录
    const limit = getMaxHistoryLimitFromNodes(nodes);
    const chatSource = {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: String(app._id)
    };
    const [{ histories }, chatDetail] = await Promise.all([
      getChatItems({
        ...chatSource,
        chatId,
        offset: 0,
        limit,
        field: `obj value memories`
      }),
      MongoChat.findOne(
        {
          ...buildChatSourceQuery({
            sourceType: ChatSourceTypeEnum.app,
            sourceId: String(app._id)
          }),
          chatId
        },
        'source variableList variables'
      )
      // auth balance
    ]);

    // 把旧的历史变量值写入
    if (chatDetail?.variables) {
      variables = {
        ...chatDetail.variables,
        ...variables
      };
    }

    const newHistories = concatHistories(histories, chatMessages);
    const interactive = getLastInteractiveValue(newHistories);

    // Get runtimeNodes
    let runtimeNodes = storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes, interactive));
    if (isPlugin) {
      runtimeNodes = updateWorkflowToolInputByVariables(runtimeNodes, variables);
      variables = {};
    }
    runtimeNodes = rewriteNodeOutputByHistories(runtimeNodes, interactive);

    const preparedRound = await preChatRound({
      ...chatSource,
      chatId,
      teamId: String(teamId),
      tmbId: String(tmbId),
      source,
      sourceName: appName || '',
      userContent: userQuestion,
      responseChatItemId: roundState.responseChatItemId,
      interactive,
      fixedTitle: pluginFixedTitle
    });

    const runningChatId = preparedRound.chatId;
    const runningSourceId = String(app._id);
    const responseChatItemId = preparedRound.responseChatItemId;
    roundState.preparedRound = preparedRound;
    roundState.sourceId = runningSourceId;
    roundState.chatId = runningChatId;
    roundState.responseChatItemId = responseChatItemId;

    streamResponseContext = await createWorkflowStreamResponseContext({
      req,
      res,
      stream: true,
      detail: true,
      teamId: String(teamId),
      sourceType: ChatSourceTypeEnum.app,
      sourceId: runningSourceId,
      chatId: runningChatId,
      responseId: runningChatId,
      showNodeStatus: true
    });

    /* start process */
    const {
      assistantResponses,
      system_memories,
      newVariables,
      durationSeconds,
      customFeedbacks,
      nodeResponseSummary
    } = await dispatchWorkFlow({
      apiVersion: 'v2',
      res,
      lang: getLocale(req),
      requestOrigin: req.headers.origin,
      mode: 'test',
      usageSource: UsageSourceEnum.fastgpt,

      uid: tmbId,

      runningAppInfo: {
        sourceType: ChatSourceTypeEnum.app,
        sourceId: runningSourceId,
        name: appName,
        teamId: app.teamId,
        tmbId: app.tmbId
      },
      runningUserInfo: await getRunningUserInfoByTmbId(tmbId),

      chatId: runningChatId,
      responseChatItemId,
      runtimeNodes,
      runtimeEdges: storeEdges2RuntimeEdges(edges, interactive),
      variables,
      query: removeEmptyUserInput(userQuestion.value),
      lastInteractive: interactive,
      chatConfig,
      histories: newHistories,
      stream: true,
      maxRunTimes: WORKFLOW_MAX_RUN_TIMES,
      workflowStreamResponse: streamResponseContext.responseWrite,
      responseDetail: true,
      showSkillReferences: true,
      nodeResponseWriteConfig: {
        persistToDb: preparedRound.shouldPersistChatRound,
        retainInMemory: false
      }
    });

    streamResponseContext.responseWrite(workflowSseEvent.answerStop());
    streamResponseContext.responseWrite(workflowSseEvent.done(SseResponseEventEnum.answer));

    const aiResponse: AIChatItemType & { dataId?: string } = {
      dataId: responseChatItemId,
      obj: ChatRoleEnum.AI,
      value: assistantResponses,
      memories: system_memories,
      customFeedbacks
    };
    const params = {
      ...chatSource,
      chatId: runningChatId,
      teamId,
      tmbId: tmbId,
      nodes,
      appChatConfig: chatConfig,
      variables: newVariables,
      source,
      sourceName: appName || '',
      userContent: userQuestion,
      aiContent: aiResponse,
      durationSeconds,
      metadata: {
        originIp
      },
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
      // 与线上流式一致：会话结束后必须落 done，否则前端会认为仍在 generating 并不断请求 /api/core/chat/resume
      await updateChatGenerateStatus({
        ...chatSource,
        chatId: runningChatId,
        status: ChatGenerateStatusEnum.done
      });
    }

    await streamResponseContext.flushResume();
  } catch (err: any) {
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
    res.status(500);
    if (streamResponseContext) {
      streamResponseContext.writeStreamError(err);
    } else {
      sseErrRes(res, err);
    }
    await streamResponseContext?.flushResume();
  } finally {
    res.end();
  }
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: '20mb'
  }
};
