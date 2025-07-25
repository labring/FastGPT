import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { type Tool } from '@modelcontextprotocol/sdk/types';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { toolValueTypeList, valueTypeJsonSchemaMap } from '@fastgpt/global/core/workflow/constants';
import { type AppChatConfigType } from '@fastgpt/global/core/app/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { type toolCallProps } from './type';
import { type AppSchema } from '@fastgpt/global/core/app/type';
import { getUserChatInfoAndAuthTeamPoints } from '@fastgpt/service/support/permission/auth/team';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { type AIChatItemType, type UserChatItemType } from '@fastgpt/global/core/chat/type';
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
import { removeDatasetCiteText } from '@fastgpt/service/core/ai/utils';

export const pluginNodes2InputSchema = (
  nodes: { flowNodeType: FlowNodeTypeEnum; inputs: FlowNodeInputItemType[] }[]
) => {
  const pluginInput = nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput);

  const schema: Tool['inputSchema'] = {
    type: 'object',
    properties: {},
    required: []
  };

  pluginInput?.inputs.forEach((input) => {
    const jsonSchema = input.valueType
      ? valueTypeJsonSchemaMap[input.valueType] || toolValueTypeList[0].jsonSchema
      : toolValueTypeList[0].jsonSchema;

    schema.properties![input.key] = {
      ...jsonSchema,
      description: input.description,
      enum: input.enum?.split('\n').filter(Boolean) || undefined
    };

    if (input.required) {
      // @ts-ignore
      schema.required.push(input.key);
    }
  });

  return schema;
};
export const workflow2InputSchema = (chatConfig?: {
  fileSelectConfig?: AppChatConfigType['fileSelectConfig'];
  variables?: AppChatConfigType['variables'];
}) => {
  const schema: Tool['inputSchema'] = {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'Question from user'
      },
      ...(chatConfig?.fileSelectConfig?.canSelectFile || chatConfig?.fileSelectConfig?.canSelectImg
        ? {
            fileUrlList: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'File linkage'
            }
          }
        : {})
    },
    required: ['question']
  };

  chatConfig?.variables?.forEach((item) => {
    const jsonSchema = item.valueType
      ? valueTypeJsonSchemaMap[item.valueType] || toolValueTypeList[0].jsonSchema
      : toolValueTypeList[0].jsonSchema;

    schema.properties![item.key] = {
      ...jsonSchema,
      description: item.description,
      enum: item.enums?.map((enumItem) => enumItem.value) || undefined
    };

    if (item.required) {
      // @ts-ignore
      schema.required!.push(item.key);
    }
  });

  return schema;
};
export const getMcpServerTools = async (key: string): Promise<Tool[]> => {
  const mcp = await MongoMcpKey.findOne({ key }, { apps: 1 }).lean();
  if (!mcp) {
    return Promise.reject(CommonErrEnum.invalidResource);
  }

  // Get app list
  const appList = await MongoApp.find(
    {
      _id: { $in: mcp.apps.map((app) => app.appId) },
      type: { $in: [AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.plugin] }
    },
    { name: 1, intro: 1 }
  ).lean();

  // Filter not permission app
  const permissionAppList = await Promise.all(
    appList.filter(async (app) => {
      try {
        await authAppByTmbId({ tmbId: mcp.tmbId, appId: app._id, per: ReadPermissionVal });
        return true;
      } catch (error) {
        return false;
      }
    })
  );

  // Get latest version
  const versionList = await Promise.all(
    permissionAppList.map((app) => getAppLatestVersion(app._id, app))
  );

  // Compute mcp tools
  const tools = versionList.map<Tool>((version, index) => {
    const app = permissionAppList[index];
    const mcpApp = mcp.apps.find((mcpApp) => String(mcpApp.appId) === String(app._id))!;

    const isPlugin = !!version.nodes.find(
      (node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput
    );

    return {
      name: mcpApp.toolName,
      description: mcpApp.description,
      inputSchema: isPlugin
        ? pluginNodes2InputSchema(version.nodes)
        : workflow2InputSchema(version.chatConfig)
    };
  });

  return tools;
};

// Call tool
export const callMcpServerTool = async ({ key, toolName, inputs }: toolCallProps) => {
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

    const {
      flowUsages,
      assistantResponses,
      newVariables,
      flowResponses,
      durationSeconds,
      system_memories
    } = await dispatchWorkFlow({
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
      [DispatchNodeResponseKeyEnum.nodeResponse]: flowResponses,
      memories: system_memories
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
      content: [userQuestion, aiResponse],
      durationSeconds
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
    let responseContent = (() => {
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

    // Format response content
    responseContent = removeDatasetCiteText(responseContent.trim(), false);

    return responseContent;
  };

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
};
