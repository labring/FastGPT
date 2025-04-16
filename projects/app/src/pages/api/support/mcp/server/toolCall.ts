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
import { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import {
  getPluginRunUserQuery,
  updatePluginInputByVariables
} from '@fastgpt/global/core/workflow/utils';
import { getPluginInputsFromStoreNodes } from '@fastgpt/global/core/app/plugin/utils';
import {
  ChatItemValueTypeEnum,
  ChatRoleEnum,
  ChatSourceEnum
} from '@fastgpt/global/core/chat/constants';
import {
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { getChatTitleFromChatMessage, removeEmptyUserInput } from '@fastgpt/global/core/chat/utils';
import { saveChat } from '@fastgpt/service/core/chat/saveChat';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { createChatUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

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
    variables.system_fileUrlList = variables.fileUrlList;
    delete variables.fileUrlList;
  }

  const chatId = getNanoid();

  const { flowUsages, assistantResponses, newVariables, flowResponses } = await dispatchWorkFlow({
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
    runtimeNodes,
    runtimeEdges: storeEdges2RuntimeEdges(edges),
    variables,
    query: removeEmptyUserInput(userQuestion.value),
    chatConfig,
    histories: [],
    stream: false,
    maxRunTimes: WORKFLOW_MAX_RUN_TIMES
  });

  // Save chat
  const aiResponse: AIChatItemType & { dataId?: string } = {
    obj: ChatRoleEnum.AI,
    value: assistantResponses,
    [DispatchNodeResponseKeyEnum.nodeResponse]: flowResponses
  };
  const newTitle = isPlugin ? 'Mcp call' : getChatTitleFromChatMessage(userQuestion);
  await saveChat({
    chatId,
    appId: app._id,
    teamId: app.teamId,
    tmbId: app.tmbId,
    nodes,
    appChatConfig: chatConfig,
    variables: newVariables,
    isUpdateUseTime: false, // owner update use time
    newTitle,
    source: ChatSourceEnum.mcp,
    content: [userQuestion, aiResponse]
  });

  // Push usage
  createChatUsage({
    appName: app.name,
    appId: app._id,
    teamId: app.teamId,
    tmbId: app.tmbId,
    source: UsageSourceEnum.mcp,
    flowUsages
  });

  // Get MCP response type
  const responseContent = (() => {
    if (isPlugin) {
      const output = flowResponses.find(
        (item) => item.moduleType === FlowNodeTypeEnum.pluginOutput
      );
      if (output) {
        return JSON.stringify(output.pluginOutput);
      } else {
        return 'Can not get response from plugin';
      }
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
    _id: { $in: mcp.apps.map((app) => app.appId) },
    type: { $in: [AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.plugin] }
  }).lean();

  const app = appList.find((app) => {
    const mcpApp = mcp.apps.find((mcpApp) => String(mcpApp.appId) === String(app._id))!;

    return toolName === mcpApp.toolName;
  });

  if (!app) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  return await dispatchApp(app, inputs);
}

export default NextAPI(handler);
