import type { NextApiRequest, NextApiResponse } from 'next';
import { createChatUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getUserChatInfoAndAuthTeamPoints } from '@fastgpt/service/support/permission/auth/team';
import { PostWorkflowDebugProps, PostWorkflowDebugResponse } from '@/global/core/workflow/api';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { defaultApp } from '@/web/core/app/constants';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  getMaxHistoryLimitFromNodes,
  getWorkflowEntryNodeIds,
  initWorkflowEdgeStatus,
  rewriteNodeOutputByHistories,
  storeNodes2RuntimeNodes,
  textAdaptGptResponse
} from '@fastgpt/global/core/workflow/runtime/utils';
import { responseWrite } from '@fastgpt/service/common/response';
import { getWorkflowResponseWrite } from '@fastgpt/service/core/workflow/dispatch/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getPluginInputsFromStoreNodes } from '@fastgpt/global/core/app/plugin/utils';
import { UserChatItemType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import {
  getPluginRunUserQuery,
  updatePluginInputByVariables
} from '@fastgpt/global/core/workflow/utils';
import { concatHistories, removeEmptyUserInput } from '@fastgpt/global/core/chat/utils';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { getChatItems } from '@fastgpt/service/core/chat/controller';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<PostWorkflowDebugResponse> {
  const {
    nodes = [],
    edges = [],
    appId,
    messages = [],
    chatId = '',
    chatConfig = defaultApp.chatConfig,
    responseChatItemId = '' // 在内联类型中添加
  } = req.body as PostWorkflowDebugProps & {
    messages?: ChatCompletionMessageParam[];
    chatId?: string;
    responseChatItemId?: string; // 在内联类型中添加
    chatConfig?: AppChatConfigType; // 在内联类型中添加
  };
  let variables = req.body.variables || {};
  if (!nodes) {
    throw new Error('Prams Error');
  }
  if (!Array.isArray(nodes)) {
    throw new Error('Nodes is not array');
  }
  if (!Array.isArray(edges)) {
    throw new Error('Edges is not array');
  }

  const entryNodeIds = nodes
    .filter((node) => node.isEntry)
    .map((node) => node.nodeId)
    .filter((nodeId) => !!nodeId);
  if (entryNodeIds.length === 0) {
    throw new Error('No entry node found');
  }
  if (entryNodeIds.length > 1) {
    throw new Error('More than one entry node found');
  }
  const isInteractiveNode = nodes.some(
    (node) =>
      node.nodeId === entryNodeIds[0] &&
      (node.flowNodeType === 'userSelect' || node.flowNodeType === 'formInput')
  );
  console.log('isInteractiveNode', isInteractiveNode);

  const chatMessages = GPTMessages2Chats(messages);
  //
  /* user auth */
  const [{ teamId, tmbId }, { app }] = await Promise.all([
    authCert({
      req,
      authToken: true
    }),
    authApp({ req, authToken: true, appId, per: ReadPermissionVal })
  ]);
  const appName = `${app.name}-Debug`;

  // auth balance
  const isPlugin = app.type === AppTypeEnum.plugin;

  let userQuestion: UserChatItemType | undefined;
  if (isInteractiveNode) {
    userQuestion = (() => {
      if (isPlugin) {
        return getPluginRunUserQuery({
          pluginInputs: getPluginInputsFromStoreNodes(app.modules),
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
  }

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

  // Get runtimeNodes
  let runtimeNodes = storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes, newHistories));
  if (isPlugin) {
    runtimeNodes = updatePluginInputByVariables(runtimeNodes, variables);
    variables = {};
  }
  runtimeNodes = rewriteNodeOutputByHistories(newHistories, runtimeNodes);
  let runtimeEdges = edges;
  let query: UserChatItemValueItemType[] = [];
  if (isInteractiveNode && userQuestion) {
    runtimeEdges = initWorkflowEdgeStatus(edges, newHistories);
    query = removeEmptyUserInput(userQuestion.value);
  } else if (!isInteractiveNode) {
    runtimeEdges = edges;
    runtimeNodes = nodes;
    query = [];
  }
  /* start process */
  const { flowUsages, flowResponses, debugResponse, newVariables } = await dispatchWorkFlow({
    res,
    requestOrigin: req.headers.origin,
    mode: 'debug',
    timezone,
    externalProvider,
    uid: tmbId,

    runningAppInfo: {
      id: app._id,
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
    runtimeEdges,
    variables,
    query,
    chatConfig: defaultApp.chatConfig,
    histories: newHistories,
    stream: false,
    maxRunTimes: WORKFLOW_MAX_RUN_TIMES
  });

  createChatUsage({
    appName,
    appId,
    teamId,
    tmbId,
    source: UsageSourceEnum.fastgpt,
    flowUsages
  });

  return {
    ...debugResponse,
    newVariables,
    flowResponses
  };
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb'
    },
    responseLimit: '20mb'
  }
};
