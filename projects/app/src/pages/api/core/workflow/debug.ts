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
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';

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
  const [{ teamId, tmbId }, { app }] = await Promise.all([
    authCert({
      req,
      authToken: true
    }),
    authApp({ req, authToken: true, appId, per: ReadPermissionVal })
  ]);

  // auth balance
  const { user } = await getUserChatInfoAndAuthTeamPoints(tmbId);

  /* start process */
  const { flowUsages, flowResponses, debugResponse, newVariables } = await dispatchWorkFlow({
    res,
    requestOrigin: req.headers.origin,
    mode: 'debug',
    runningAppInfo: {
      id: appId,
      teamId,
      tmbId
    },
    uid: tmbId,
    user,
    runtimeNodes: nodes,
    runtimeEdges: edges,
    variables,
    query: [],
    chatConfig: defaultApp.chatConfig,
    histories: [],
    stream: false,
    maxRunTimes: WORKFLOW_MAX_RUN_TIMES
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
