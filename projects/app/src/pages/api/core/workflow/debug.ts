import type { NextApiRequest, NextApiResponse } from 'next';
import { createChatUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getUserChatInfoAndAuthTeamPoints } from '@fastgpt/service/support/permission/auth/team';
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';
import type { PostWorkflowDebugProps, PostWorkflowDebugResponse } from '@/global/core/workflow/api';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { getLastInteractiveValue } from '@fastgpt/global/core/workflow/runtime/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<PostWorkflowDebugResponse> {
  const {
    nodes = [],
    edges = [],
    skipNodeQueue,
    variables = {},
    appId,
    query = [],
    history = [],
    chatConfig
  } = req.body as PostWorkflowDebugProps;
  if (!nodes) {
    return Promise.reject('Prams Error');
  }
  if (!Array.isArray(nodes)) {
    return Promise.reject('Nodes is not array');
  }
  if (!Array.isArray(edges)) {
    return Promise.reject('Edges is not array');
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
  const { timezone, externalProvider } = await getUserChatInfoAndAuthTeamPoints(tmbId);
  const interactive = getLastInteractiveValue(history);

  /* start process */
  const { flowUsages, debugResponse, newVariables } = await dispatchWorkFlow({
    res,
    lang: getLocale(req),
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
    runningUserInfo: await getRunningUserInfoByTmbId(tmbId),
    runtimeNodes: nodes,
    runtimeEdges: edges,
    defaultSkipNodeQueue: skipNodeQueue,
    lastInteractive: interactive,
    variables,
    query: query,
    chatConfig: chatConfig || app.chatConfig,
    histories: history,
    stream: false,
    maxRunTimes: WORKFLOW_MAX_RUN_TIMES
  });

  createChatUsage({
    appName: `${app.name}-Debug`,
    appId,
    teamId,
    tmbId,
    source: UsageSourceEnum.fastgpt,
    flowUsages
  });

  return {
    ...debugResponse!,
    newVariables
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
