import type { NextApiRequest, NextApiResponse } from 'next';
import { sseErrRes } from '@fastgpt/service/common/response';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { responseWrite } from '@fastgpt/service/common/response';
import { createChatUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { getUserChatInfoAndAuthTeamPoints } from '@fastgpt/service/support/permission/auth/team';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import {
  concatHistories,
  getChatTitleFromChatMessage,
  removeEmptyUserInput
} from '@fastgpt/global/core/chat/utils';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  getPluginRunUserQuery,
  updatePluginInputByVariables
} from '@fastgpt/global/core/workflow/utils';
import { NextAPI } from '@/service/middleware/entry';
import { chatValue2RuntimePrompt, GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
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
import { getPluginInputsFromStoreNodes } from '@fastgpt/global/core/app/plugin/utils';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { getSystemTime } from '@fastgpt/global/common/time/timezone';
import {
  ChatItemValueTypeEnum,
  ChatRoleEnum,
  ChatSourceEnum
} from '@fastgpt/global/core/chat/constants';
import { saveChat, updateInteractiveChat } from '@fastgpt/service/core/chat/saveChat';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { addLog } from '@fastgpt/service/common/system/log';
import requestIp from 'request-ip';

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
  metadata?: Record<string, any>;
  selectedToolIds?: string[];
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const startTime = Date.now();
  const originIp = requestIp.getClientIp(req);

  let {
    nodes = [],
    edges = [],
    messages = [],
    responseChatItemId,
    variables = {},
    appName,
    appId,
    chatConfig,
    chatId,
    metadata = {},
    selectedToolIds = []
  } = req.body as Props;
  try {
    if (!Array.isArray(nodes)) {
      throw new Error('Nodes is not array');
    }
    if (!Array.isArray(edges)) {
      throw new Error('Edges is not array');
    }

    //对边进行过滤，只保留selectedToolIds中的边
    console.log('selectedToolIds', selectedToolIds);

    // 创建从 pluginId 到 nodeId 的映射
    const pluginIdToNodeIdMap = new Map<string, string>();
    nodes.forEach((node) => {
      if (node.pluginId) {
        pluginIdToNodeIdMap.set(node.pluginId, node.nodeId);
      }
    });
    console.log('pluginIdToNodeIdMap', Object.fromEntries(pluginIdToNodeIdMap));

    // 获取选中工具对应的 nodeId 集合
    const selectedNodeIds = new Set<string>();
    selectedToolIds.forEach((pluginId) => {
      const nodeId = pluginIdToNodeIdMap.get(pluginId);
      if (nodeId) {
        selectedNodeIds.add(nodeId);
      }
    });
    console.log('selectedNodeIds', Array.from(selectedNodeIds));

    // 过滤边：保留第一个边和目标节点在选中工具中的边
    const filteredEdges = edges.filter((edge, index) => {
      // 保留第一个边
      if (index === 0) {
        return true;
      }

      // 保留目标节点在选中工具中的边
      return selectedNodeIds.has(edge.target);
    });

    console.log('Original edges count:', edges.length);
    console.log('Filtered edges count:', filteredEdges.length);
    console.log('Filtered edges:', filteredEdges);

    // 使用过滤后的边
    edges = filteredEdges;

    const chatMessages = GPTMessages2Chats(messages);
    // console.log(JSON.stringify(chatMessages, null, 2), '====', chatMessages.length);

    /* user auth */
    const { app, teamId, tmbId } = await authApp({
      req,
      authToken: true,
      appId,
      per: ReadPermissionVal
    });

    const isPlugin = app.type === AppTypeEnum.plugin;
    const isTool = app.type === AppTypeEnum.tool;

    const userQuestion: UserChatItemType = await (async () => {
      if (isPlugin) {
        return getPluginRunUserQuery({
          pluginInputs: getPluginInputsFromStoreNodes(app.modules),
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
    const [{ histories }, chatDetail, { timezone, externalProvider }] = await Promise.all([
      getChatItems({
        appId,
        chatId,
        offset: 0,
        limit,
        field: `dataId obj value nodeOutputs`
      }),
      MongoChat.findOne({ appId: app._id, chatId }, 'source variableList variables'),
      // auth balance
      getUserChatInfoAndAuthTeamPoints(tmbId)
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
      runtimeNodes = updatePluginInputByVariables(runtimeNodes, variables);
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
    const { flowResponses, assistantResponses, newVariables, flowUsages, durationSeconds } =
      await dispatchWorkFlow({
        res,
        requestOrigin: req.headers.origin,
        mode: 'test',
        timezone,
        externalProvider,
        uid: tmbId,

        runningAppInfo: {
          id: appId,
          teamId: app.teamId,
          tmbId: app.tmbId
        },
        runningUserInfo: {
          teamId,
          tmbId
        },

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
        version: 'v2',
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
    const { text: userInteractiveVal } = chatValue2RuntimePrompt(userQuestion.value);

    const newTitle = isPlugin
      ? variables.cTime ?? getSystemTime(timezone)
      : getChatTitleFromChatMessage(userQuestion);

    const aiResponse: AIChatItemType & { dataId?: string } = {
      dataId: responseChatItemId,
      obj: ChatRoleEnum.AI,
      value: assistantResponses,
      [DispatchNodeResponseKeyEnum.nodeResponse]: flowResponses
    };

    const saveChatId = chatId || getNanoid(24);
    if (isInteractiveRequest) {
      await updateInteractiveChat({
        chatId: saveChatId,
        appId: app._id,
        userInteractiveVal,
        aiResponse,
        newVariables,
        durationSeconds
      });
    } else {
      await saveChat({
        chatId: saveChatId,
        appId: app._id,
        teamId,
        tmbId: tmbId,
        nodes,
        appChatConfig: chatConfig,
        variables: newVariables,
        isUpdateUseTime: false, // owner update use time
        newTitle,
        source: ChatSourceEnum.online,
        sourceName: '',
        content: [userQuestion, aiResponse],
        metadata: {
          originIp,
          ...metadata
        },
        durationSeconds
      });
    }

    addLog.info(`chatGate running time: ${(Date.now() - startTime) / 1000}s`);

    createChatUsage({
      appName,
      appId,
      teamId,
      tmbId,
      source: UsageSourceEnum.fastgpt,
      flowUsages
    });
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
