import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { Tool } from '@modelcontextprotocol/sdk/types';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { toolValueTypeList } from '@fastgpt/global/core/workflow/constants';
import { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

export type listToolsQuery = { key: string };

export type listToolsBody = {};

export type listToolsResponse = {};

const pluginNodes2InputSchema = (nodes: StoreNodeItemType[]) => {
  const pluginInput = nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput);

  const schema: Tool['inputSchema'] = {
    type: 'object',
    properties: {},
    required: []
  };

  pluginInput?.inputs.forEach((input) => {
    const jsonSchema = (
      toolValueTypeList.find((type) => type.value === input.valueType) || toolValueTypeList[0]
    )?.jsonSchema;

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
const workflow2InputSchema = (chatConfig?: AppChatConfigType) => {
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
    const jsonSchema = (
      toolValueTypeList.find((type) => type.value === item.valueType) || toolValueTypeList[0]
    )?.jsonSchema;

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

async function handler(
  req: ApiRequestProps<listToolsBody, listToolsQuery>,
  res: ApiResponseType<any>
): Promise<Tool[]> {
  const { key } = req.query;

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
}

export default NextAPI(handler);
