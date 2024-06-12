import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { sseErrRes } from '@fastgpt/service/common/response';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { responseWrite } from '@fastgpt/service/common/response';
import { pushChatUsage } from '@/service/support/wallet/usage/push';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type {
  ChatItemType,
  ChatItemValueItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getUserChatInfoAndAuthTeamPoints } from '@/service/support/permission/auth/team';
import { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { removeEmptyUserInput } from '@fastgpt/global/core/chat/utils';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

export type Props = {
  history: ChatItemType[];
  prompt: UserChatItemValueItemType[];
  nodes: RuntimeNodeItemType[];
  edges: RuntimeEdgeItemType[];
  variables: Record<string, any>;
  appId: string;
  appName: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    history = [],
    prompt,
    variables = {},
    appName,
    appId
  } = req.body as Props;
  try {
    await connectToDatabase();
    if (!history || !nodes || !prompt || prompt.length === 0) {
      throw new Error('Prams Error');
    }
    if (!Array.isArray(nodes)) {
      throw new Error('Nodes is not array');
    }
    if (!Array.isArray(edges)) {
      throw new Error('Edges is not array');
    }

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

    /* start process */
    const { flowResponses, flowUsages } = await dispatchWorkFlow({
      res,
      mode: 'test',
      teamId,
      tmbId,
      user,
      app,
      runtimeNodes: nodes,
      runtimeEdges: edges,
      variables,
      query: removeEmptyUserInput(prompt),
      histories: history,
      stream: true,
      detail: true,
      maxRunTimes: 200
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

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: '20mb'
  }
};
