import type { NextApiRequest, NextApiResponse } from 'next';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authModels } from '@fastgpt/service/support/permission/model/auth';
import { extractWorkflowModelIds } from '@fastgpt/global/core/workflow/utils';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { prepareWorkflowFileQuery } from '@fastgpt/service/core/workflow/utils/fileLimits';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { getLastInteractiveValue } from '@fastgpt/global/core/workflow/runtime/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { createChatUsageRecord } from '@fastgpt/service/support/wallet/usage/controller';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  WorkflowDebugBodySchema,
  WorkflowDebugResponseSchema,
  type WorkflowDebugResponse
} from '@fastgpt/global/openapi/core/workflow/api';
import {
  composeDebugNodeResponseMap,
  getWorkflowFinalResponseData
} from '@/service/core/workflow/nodeResponse';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<WorkflowDebugResponse> {
  const {
    nodes = [],
    edges = [],
    skipNodeQueue,
    variables = {},
    appId,
    query = [],
    history = [],
    chatConfig,
    usageId,
    chatId: debugChatId
  } = parseApiInput({ req, bodySchema: WorkflowDebugBodySchema }).body;

  /* user auth */
  const [{ tmbId }, { app }] = await Promise.all([
    authCert({
      req,
      authToken: true
    }),
    authApp({ req, authToken: true, appId, per: ReadPermissionVal })
  ]);

  // Model permission: validate all modelIds referenced by workflow nodes (design A3)
  const modelIds = extractWorkflowModelIds({ modules: nodes, chatConfig });
  if (modelIds.length > 0) {
    await authModels({
      req,
      authToken: true,
      modelIds,
      per: ReadPermissionVal
    });
  }

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
  const workflowChatConfig = chatConfig ?? app.chatConfig;
  const {
    query: workflowQuery,
    maxFileAmount,
    maxBytesPerFile
  } = await prepareWorkflowFileQuery({
    teamId: String(app.teamId),
    chatConfig: workflowChatConfig,
    query
  });

  /* start process */
  const { debugResponse, newVariables, flatNodeResponses } = await dispatchWorkFlow({
    res,
    lang: getLocale(req),
    requestOrigin: req.headers.origin,
    mode: 'debug',
    uid: tmbId,
    usageId: newUsageId,
    runningAppInfo: {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: String(app._id),
      name: app.name,
      teamId: app.teamId,
      tmbId: app.tmbId
    },
    runningUserInfo: await getRunningUserInfoByTmbId(tmbId),
    chatId: debugChatId ?? getNanoid(),
    responseChatItemId,
    runtimeNodes: nodes,
    runtimeEdges: edges,
    defaultSkipNodeQueue: skipNodeQueue,
    lastInteractive: interactive,
    variables,
    query: workflowQuery,
    maxFileAmount,
    maxBytesPerFile,
    chatConfig: workflowChatConfig,
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
    currentNodeResponses: debugResponse?.nodeResponses ?? {}
  });

  return WorkflowDebugResponseSchema.parse({
    ...debugResponse!,
    nodeResponses,
    newVariables,
    usageId: newUsageId
  });
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
