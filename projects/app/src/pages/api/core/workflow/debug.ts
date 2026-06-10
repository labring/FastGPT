import type { NextApiRequest, NextApiResponse } from 'next';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';
import type { PostWorkflowDebugProps, PostWorkflowDebugResponse } from '@/global/core/workflow/api';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { getLastInteractiveValue } from '@fastgpt/global/core/workflow/runtime/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { createChatUsageRecord } from '@fastgpt/service/support/wallet/usage/controller';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import z from 'zod';
import {
  composeDebugNodeResponseMap,
  getWorkflowFinalResponseData
} from '@/service/core/workflow/nodeResponse';

const WorkflowDebugBodySchema = z.object({
  // Runtime node 仍包含大量未完全 schema 化的动态配置，这里只在 API 边界约束数组结构。
  nodes: z.array(z.any()).default([]),
  edges: z.array(z.any()).default([]),
  skipNodeQueue: z.any().optional(),
  variables: z.record(z.string(), z.any()).default({}),
  appId: ObjectIdSchema,
  query: z.array(z.any()).default([]),
  history: z.array(z.any()).default([]),
  chatConfig: z.any().optional(),
  usageId: z.string().optional()
});

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
    chatConfig,
    usageId
  } = parseApiInput({ req, bodySchema: WorkflowDebugBodySchema }).body as PostWorkflowDebugProps;

  /* user auth */
  const [{ tmbId }, { app }] = await Promise.all([
    authCert({
      req,
      authToken: true
    }),
    authApp({ req, authToken: true, appId, per: ReadPermissionVal })
  ]);

  const interactive = getLastInteractiveValue(history);
  const newUsageId = usageId
    ? usageId
    : await createChatUsageRecord({
        appName: app.name,
        appId: app._id,
        teamId: app.teamId,
        tmbId: tmbId,
        source: UsageSourceEnum.fastgpt
      });
  const responseChatItemId = getNanoid();

  /* start process */
  const { debugResponse, newVariables, flatNodeResponses } = await dispatchWorkFlow({
    res,
    lang: getLocale(req),
    requestOrigin: req.headers.origin,
    mode: 'debug',
    uid: tmbId,
    usageId: newUsageId,
    runningAppInfo: {
      id: app._id,
      name: app.name,
      teamId: app.teamId,
      tmbId: app.tmbId
    },
    runningUserInfo: await getRunningUserInfoByTmbId(tmbId),
    chatId: getNanoid(),
    responseChatItemId,
    runtimeNodes: nodes,
    runtimeEdges: edges,
    defaultSkipNodeQueue: skipNodeQueue,
    lastInteractive: interactive,
    variables,
    query: query,
    chatConfig: chatConfig || app.chatConfig,
    histories: history,
    stream: false,
    maxRunTimes: WORKFLOW_MAX_RUN_TIMES,
    nodeResponseWriteConfig: {
      persistToDb: false,
      retainInMemory: true
    }
  });
  const nodeResponses = composeDebugNodeResponseMap({
    detailTree: getWorkflowFinalResponseData({
      flatNodeResponses,
      shouldCollect: true
    }),
    currentNodeResponses: debugResponse?.nodeResponses || {}
  });

  return {
    ...debugResponse!,
    nodeResponses,
    newVariables,
    usageId: newUsageId
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
