import type { NextApiRequest, NextApiResponse } from 'next';
import { sseErrRes } from '@fastgpt/service/common/response';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { responseWrite } from '@fastgpt/service/common/response';
import { pushChatUsage } from '@/service/support/wallet/usage/push';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getUserChatInfoAndAuthTeamPoints } from '@/service/support/permission/auth/team';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { removeEmptyUserInput } from '@fastgpt/global/core/chat/utils';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { updatePluginInputByVariables } from '@fastgpt/global/core/workflow/utils';
import { NextAPI } from '@/service/middleware/entry';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { AppChatConfigType } from '@fastgpt/global/core/app/type';
import {
  getWorkflowEntryNodeIds,
  initWorkflowEdgeStatus,
  rewriteNodeOutputByHistories,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getWorkflowResponseWrite } from '@fastgpt/service/core/workflow/dispatch/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';

export type Props = {
  messages: ChatCompletionMessageParam[];
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  variables: Record<string, any>;
  appId: string;
  appName: string;
  chatConfig: AppChatConfigType;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.on('close', () => {
    res.end();
  });
  res.on('error', () => {
    console.log('error: ', 'request error');
    res.end();
  });

  let {
    nodes = [],
    edges = [],
    messages = [],
    variables = {},
    appName,
    appId,
    chatConfig
  } = req.body as Props;
  try {
    if (!Array.isArray(nodes)) {
      throw new Error('Nodes is not array');
    }
    if (!Array.isArray(edges)) {
      throw new Error('Edges is not array');
    }
    const chatMessages = GPTMessages2Chats(messages);
    const userInput = chatMessages.pop()?.value as UserChatItemValueItemType[] | undefined;

    // console.log(JSON.stringify(chatMessages, null, 2), '====', chatMessages.length);

    /* user auth */
    const [{ app }, { teamId, tmbId }] = await Promise.all([
      authApp({ req, authToken: true, appId, per: ReadPermissionVal }),
      authCert({
        req,
        authToken: true
      })
    ]);
    // auth balance
    const { user } = await getUserChatInfoAndAuthTeamPoints(tmbId);

    const isPlugin = app.type === AppTypeEnum.plugin;

    let runtimeNodes = storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes, chatMessages));

    // Plugin need to replace inputs
    if (isPlugin) {
      runtimeNodes = updatePluginInputByVariables(runtimeNodes, variables);
      variables = {};
    } else {
      if (!userInput) {
        throw new Error('Params Error');
      }
    }

    runtimeNodes = rewriteNodeOutputByHistories(chatMessages, runtimeNodes);
    const workflowResponseWrite = getWorkflowResponseWrite({
      res,
      detail: true,
      streamResponse: true,
      id: getNanoid(24)
    });

    /* start process */
    const { flowResponses, flowUsages } = await dispatchWorkFlow({
      res,
      requestOrigin: req.headers.origin,
      mode: 'test',
      runningAppInfo: {
        id: appId,
        teamId,
        tmbId
      },
      uid: tmbId,
      user,
      runtimeNodes,
      runtimeEdges: initWorkflowEdgeStatus(edges, chatMessages),
      variables,
      query: removeEmptyUserInput(userInput),
      chatConfig,
      histories: chatMessages,
      stream: true,
      maxRunTimes: 200,
      workflowStreamResponse: workflowResponseWrite
    });

    responseWrite({
      res,
      event: SseResponseEventEnum.answer,
      data: '[DONE]'
    });
    responseWrite({
      res,
      event: SseResponseEventEnum.flowResponses,
      data: JSON.stringify(flowResponses)
    });

    res.end();

    pushChatUsage({
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
