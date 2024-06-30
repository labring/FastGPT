import type { NextApiRequest, NextApiResponse } from 'next';
import { pushChatUsage } from '@/service/support/wallet/usage/push';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getUserChatInfoAndAuthTeamPoints } from '@/service/support/permission/auth/team';
import { PostWorkflowDebugProps, PostWorkflowDebugResponse } from '@/global/core/workflow/api';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { defaultApp } from '@/web/core/app/constants';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<PostWorkflowDebugResponse> {
  const { nodes = [], edges = [], variables = {}, appId } = req.body as PostWorkflowDebugProps;

  if (!nodes) {
    throw new Error('Prams Error');
  }
  if (!Array.isArray(nodes)) {
    throw new Error('Nodes is not array');
  }
  if (!Array.isArray(edges)) {
    throw new Error('Edges is not array');
  }

  /* user auth */
  const [{ teamId, tmbId }] = await Promise.all([
    authCert({
      req,
      authToken: true
    }),
    authApp({ req, authToken: true, appId, per: ReadPermissionVal })
  ]);

  // auth balance
  const { user } = await getUserChatInfoAndAuthTeamPoints(tmbId);

  const app = {
    ...defaultApp,
    teamId,
    tmbId
  };

  /* start process */
  const { flowUsages, flowResponses, debugResponse } = await dispatchWorkFlow({
    res,
    mode: 'debug',
    teamId,
    tmbId,
    user,
    app,
    runtimeNodes: nodes,
    runtimeEdges: edges,
    variables,
    query: [],
    histories: [],
    stream: false,
    detail: true,
    maxRunTimes: 200
  });

  pushChatUsage({
    appName: '工作流Debug',
    appId,
    teamId,
    tmbId,
    source: UsageSourceEnum.fastgpt,
    flowUsages
  });

  return {
    ...debugResponse,
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
