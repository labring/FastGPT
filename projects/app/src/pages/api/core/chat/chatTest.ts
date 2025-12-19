import type { NextApiRequest, NextApiResponse } from 'next';
import { sseErrRes } from '@fastgpt/service/common/response';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { responseWrite } from '@fastgpt/service/common/response';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import {
  concatHistories,
  getChatTitleFromChatMessage,
  removeEmptyUserInput
} from '@fastgpt/global/core/chat/utils';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  serverGetWorkflowToolRunUserQuery,
  updateWorkflowToolInputByVariables
} from '@fastgpt/service/core/app/tool/workflowTool/utils';
import { NextAPI } from '@/service/middleware/entry';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import {
  getLastInteractiveValue,
  getMaxHistoryLimitFromNodes,
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges,
  rewriteNodeOutputByHistories,
  storeNodes2RuntimeNodes,
  textAdaptGptResponse
} from '@fastgpt/global/core/workflow/runtime/utils';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getWorkflowResponseWrite } from '@fastgpt/service/core/workflow/dispatch/utils';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { getWorkflowToolInputsFromStoreNodes } from '@fastgpt/global/core/app/tool/workflowTool/utils';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import {
  ChatItemValueTypeEnum,
  ChatRoleEnum,
  ChatSourceEnum
} from '@fastgpt/global/core/chat/constants';
import { saveChat, updateInteractiveChat } from '@fastgpt/service/core/chat/saveChat';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { LimitTypeEnum, teamFrequencyLimit } from '@fastgpt/service/common/api/frequencyLimit';
import { getIpFromRequest } from '@fastgpt/service/common/geo';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';

export type Props = {
  messages: ChatCompletionMessageParam[];
  responseChatItemId: string;
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  variables: Record<string, any>;
  appId: string;
  appName: string;
  chatId: string;
  chatConfig: AppChatConfigType;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  let {
    nodes = [],
    edges = [],
    messages = [],
    responseChatItemId,
    variables = {},
    appName,
    appId,
    chatConfig,
    chatId
  } = req.body as Props;
  try {
    if (!Array.isArray(nodes)) {
      throw new Error('Nodes is not array');
    }
    if (!Array.isArray(edges)) {
      throw new Error('Edges is not array');
    }

    const originIp = getIpFromRequest(req);

    const chatMessages = GPTMessages2Chats({ messages });
    // console.log(JSON.stringify(chatMessages, null, 2), '====', chatMessages.length);

    /* user auth */
    const { app, teamId, tmbId } = await authApp({
      req,
      authToken: true,
      appId,
      per: ReadPermissionVal
    });

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

    const isPlugin = app.type === AppTypeEnum.workflowTool;
    const isTool = app.type === AppTypeEnum.tool;

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
              type: ChatItemValueTypeEnum.text,
              text: { content: 'tool test' }
            }
          ]
        };
      }

      const latestHumanChat = chatMessages.pop() as UserChatItemType;
      if (!latestHumanChat) {
        return Promise.reject('User question is empty');
      }
      return latestHumanChat;
    })();

    const limit = getMaxHistoryLimitFromNodes(nodes);
    const [{ histories }, chatDetail] = await Promise.all([
      getChatItems({
        appId,
        chatId,
        offset: 0,
        limit,
        field: `obj value memories`
      }),
      MongoChat.findOne({ appId: app._id, chatId }, 'source variableList variables')
      // auth balance
    ]);

    if (chatDetail?.variables) {
      variables = {
        ...chatDetail.variables,
        ...variables
      };
    }

    const newHistories = concatHistories(histories, chatMessages);
    const interactive = getLastInteractiveValue(newHistories) || undefined;
    // Get runtimeNodes
    let runtimeNodes = storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes, interactive));
    if (isPlugin) {
      runtimeNodes = updateWorkflowToolInputByVariables(runtimeNodes, variables);
      variables = {};
    }
    runtimeNodes = rewriteNodeOutputByHistories(runtimeNodes, interactive);

    const workflowResponseWrite = getWorkflowResponseWrite({
      res,
      detail: true,
      streamResponse: true,
      id: chatId,
      showNodeStatus: true
    });

    /* start process */
    const { flowResponses, assistantResponses, system_memories, newVariables, durationSeconds } =
      await dispatchWorkFlow({
        apiVersion: 'v2',
        res,
        lang: getLocale(req),
        requestOrigin: req.headers.origin,
        mode: 'test',
        usageSource: UsageSourceEnum.fastgpt,

        uid: tmbId,

        runningAppInfo: {
          id: appId,
          name: appName,
          teamId: app.teamId,
          tmbId: app.tmbId
        },
        runningUserInfo: await getRunningUserInfoByTmbId(tmbId),

        chatId,
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
        workflowStreamResponse: workflowResponseWrite,
        responseDetail: true
      });

    workflowResponseWrite({
      event: SseResponseEventEnum.answer,
      data: textAdaptGptResponse({
        text: null,
        finish_reason: 'stop'
      })
    });
    responseWrite({
      res,
      event: SseResponseEventEnum.answer,
      data: '[DONE]'
    });

    // save chat
    const isInteractiveRequest = !!getLastInteractiveValue(histories);

    const newTitle = isPlugin
      ? variables.cTime || formatTime2YMDHM(new Date())
      : getChatTitleFromChatMessage(userQuestion);

    const aiResponse: AIChatItemType & { dataId?: string } = {
      dataId: responseChatItemId,
      obj: ChatRoleEnum.AI,
      value: assistantResponses,
      memories: system_memories,
      [DispatchNodeResponseKeyEnum.nodeResponse]: flowResponses
    };
    const params = {
      chatId,
      appId: app._id,
      teamId,
      tmbId: tmbId,
      nodes,
      appChatConfig: chatConfig,
      variables: newVariables,
      newTitle,
      source: ChatSourceEnum.test,
      userContent: userQuestion,
      aiContent: aiResponse,
      durationSeconds,
      metadata: {
        originIp
      }
    };

    if (isInteractiveRequest) {
      await updateInteractiveChat(params);
    } else {
      await saveChat(params);
    }
  } catch (err: any) {
    res.status(500);
    sseErrRes(res, err);
  }
  res.end();
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
