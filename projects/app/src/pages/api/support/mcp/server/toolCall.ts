import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppSchema } from '@fastgpt/global/core/app/type';
import { getUserChatInfoAndAuthTeamPoints } from '@fastgpt/service/support/permission/auth/team';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { UserChatItemType } from '@fastgpt/global/core/chat/type';
import {
  getPluginRunUserQuery,
  updatePluginInputByVariables
} from '@fastgpt/global/core/workflow/utils';
import { getPluginInputsFromStoreNodes } from '@fastgpt/global/core/app/plugin/utils';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  getWorkflowEntryNodeIds,
  initWorkflowEdgeStatus,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { removeEmptyUserInput } from '@fastgpt/global/core/chat/utils';

export type toolCallQuery = {};

export type toolCallBody = {
  key: string;
  toolName: string;
  inputs: Record<string, any>;
};

export type toolCallResponse = {};

const dispatchApp = async (app: AppSchema, variables: Record<string, any>) => {
  const isPlugin = app.type === AppTypeEnum.plugin;

  const { timezone, externalProvider } = await getUserChatInfoAndAuthTeamPoints(app.tmbId);
  // Get app latest version
  const { nodes, edges, chatConfig } = await getAppLatestVersion(app._id, app);

  const userQuestion: UserChatItemType = (() => {
    if (isPlugin) {
      return getPluginRunUserQuery({
        pluginInputs: getPluginInputsFromStoreNodes(nodes || app.modules),
        variables
      });
    }

    return {
      obj: ChatRoleEnum.Human,
      value: [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: variables.question
          }
        }
      ]
    };
  })();

  let runtimeNodes = storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes));
  if (isPlugin) {
    // Assign values to runtimeNodes using variables
    runtimeNodes = updatePluginInputByVariables(runtimeNodes, variables);
    // Plugin runtime does not need global variables(It has been injected into the pluginInputNode)
    variables = {};
  } else {
    delete variables.question;
  }

  const chatId = getNanoid();

  const { flowUsages, assistantResponses, flowResponses } = await dispatchWorkFlow({
    chatId,
    timezone,
    externalProvider,
    mode: 'chat',
    runningAppInfo: {
      id: String(app._id),
      teamId: String(app.teamId),
      tmbId: String(app.tmbId)
    },
    runningUserInfo: {
      teamId: String(app.teamId),
      tmbId: String(app.tmbId)
    },
    uid: String(app.tmbId),
    runtimeNodes: storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes)),
    runtimeEdges: initWorkflowEdgeStatus(edges),
    variables: {},
    query: removeEmptyUserInput(userQuestion.value),
    chatConfig,
    histories: [],
    stream: false,
    maxRunTimes: WORKFLOW_MAX_RUN_TIMES
  });

  const responseContent = (() => {
    if (isPlugin) {
      return assistantResponses;
    }

    return assistantResponses
      .map((item) => item?.text?.content)
      .filter(Boolean)
      .join('\n');
  })();

  return responseContent;
};

async function handler(
  req: ApiRequestProps<toolCallBody, toolCallQuery>,
  res: ApiResponseType<any>
): Promise<toolCallResponse> {
  const { key, toolName, inputs } = req.body;

  const mcp = await MongoMcpKey.findOne({ key }, { apps: 1 }).lean();

  if (!mcp) {
    return Promise.reject(CommonErrEnum.invalidResource);
  }

  // Get app list
  const appList = await MongoApp.find({
    _id: { $in: mcp.apps.map((app) => app.id) },
    type: { $in: [AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.plugin] }
  }).lean();

  const app = appList.find((app) => {
    const mcpApp = mcp.apps.find((mcpApp) => String(mcpApp.id) === String(app._id));

    return toolName === app?.name || toolName === mcpApp?.name;
  });

  if (!app) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  return await dispatchApp(app, inputs);
}

export default NextAPI(handler);
