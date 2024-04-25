import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { jsonRes } from '@fastgpt/service/common/response';
import { pushChatUsage } from '@/service/support/wallet/usage/push';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { authApp } from '@fastgpt/service/support/permission/auth/app';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getUserChatInfoAndAuthTeamPoints } from '@/service/support/permission/auth/team';
import { PostWorkflowDebugProps, PostWorkflowDebugResponse } from '@/global/core/workflow/api';
import { authPluginCrud } from '@fastgpt/service/support/permission/auth/plugin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const {
    nodes = [],
    edges = [],
    variables = {},
    appId,
    pluginId
  } = req.body as PostWorkflowDebugProps;
  try {
    await connectToDatabase();
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
      appId && authApp({ req, authToken: true, appId, per: 'r' }),
      pluginId && authPluginCrud({ req, authToken: true, pluginId, per: 'r' })
    ]);

    // auth balance
    const { user } = await getUserChatInfoAndAuthTeamPoints(tmbId);

    /* start process */
    const { flowUsages, flowResponses, debugResponse } = await dispatchWorkFlow({
      res,
      mode: 'debug',
      teamId,
      tmbId,
      user,
      appId,
      runtimeNodes: nodes,
      runtimeEdges: edges,
      variables: {
        ...variables,
        userChatInput: ''
      },
      inputFiles: [],
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

    jsonRes<PostWorkflowDebugResponse>(res, {
      data: {
        ...debugResponse,
        flowResponses
      }
    });
  } catch (err: any) {
    jsonRes(res, {
      code: 500,
      error: err
    });
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
