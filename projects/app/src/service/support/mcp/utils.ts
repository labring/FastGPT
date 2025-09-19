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
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';
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
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { removeDatasetCiteText } from '@fastgpt/global/core/ai/llm/utils';
import { HTTPClient } from '@fastgpt/service/core/app/http';
import { getSecretValue } from '@fastgpt/service/common/secret/utils';

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
      type: {
        $in: [
          AppTypeEnum.simple,
          AppTypeEnum.workflow,
          AppTypeEnum.plugin,
          AppTypeEnum.httpToolSet,
          AppTypeEnum.httpPlugin
        ]
      }
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
  const tools = versionList
    .map<Tool | Tool[]>((version, index) => {
      const app = permissionAppList[index];
      const mcpApp = mcp.apps.find((mcpApp) => String(mcpApp.appId) === String(app._id))!;

      // New HTTP tool set/http plugin: expand toolList to multiple tools
      const httpToolSet = version.nodes?.[0]?.toolConfig?.httpToolSet;
      const httpTools = httpToolSet?.toolList;
      if (httpTools && Array.isArray(httpTools) && httpTools.length > 0) {
        return httpTools.map<Tool>((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: {
            type: 'object',
            properties: tool.inputSchema?.properties || {},
            required: (tool.inputSchema as any)?.required || []
          }
        }));
      }

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
    })
    .flat();

  return tools;
};

// Call tool
export const callMcpServerTool = async ({ key, toolName, inputs }: toolCallProps) => {
  const dispatchApp = async (app: AppSchema, variables: Record<string, any>) => {
    const isPlugin = app.type === AppTypeEnum.plugin;

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
      mode: 'chat',
      usageSource: UsageSourceEnum.mcp,
      runningAppInfo: {
        id: String(app._id),
        name: app.name,
        teamId: String(app.teamId),
        tmbId: String(app.tmbId)
      },
      runningUserInfo: await getRunningUserInfoByTmbId(app.tmbId),
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
      userContent: userQuestion,
      aiContent: aiResponse,
      durationSeconds
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
    type: {
      $in: [
        AppTypeEnum.simple,
        AppTypeEnum.workflow,
        AppTypeEnum.plugin,
        AppTypeEnum.httpToolSet,
        AppTypeEnum.httpPlugin
      ]
    }
  }).lean();

  let app = appList.find((app) => {
    const mcpApp = mcp.apps.find((mcpApp) => String(mcpApp.appId) === String(app._id))!;

    return toolName === mcpApp.toolName;
  });

  // fallback: match httpToolSet child tool by name
  let httpMatch:
    | {
        url: string;
        headerSecret?: any;
        tool: { name: string; path?: string; method?: string; inputSchema?: any };
      }
    | undefined;

  if (!app) {
    for (const candidate of appList) {
      const { nodes } = await getAppLatestVersion(candidate._id, candidate);
      const httpToolSet = nodes?.[0]?.toolConfig?.httpToolSet ?? nodes?.[0]?.inputs?.[0]?.value;
      const tool = httpToolSet?.toolList?.find((t: any) => t?.name === toolName);
      if (tool) {
        app = candidate as any;
        httpMatch = { url: httpToolSet.url, headerSecret: httpToolSet.headerSecret, tool };
        break;
      }
    }
  }

  if (!app) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // If matched http tool directly, call via HTTP client
  if (httpMatch) {
    const httpClient = new HTTPClient({
      url: httpMatch.url,
      headers: getSecretValue({ storeSecret: httpMatch.headerSecret })
    });
    const result = await httpClient.toolCallSimple(
      toolName,
      inputs,
      httpMatch.tool.path,
      httpMatch.tool.method || 'POST'
    );
    if ((result as any).isError) {
      throw new Error((result as any).message || 'HTTP request failed');
    }
    return (result as any).content?.[0]?.text ?? JSON.stringify(result);
  }

  return await dispatchApp(app, inputs);
};
