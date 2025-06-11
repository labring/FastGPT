import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type AppDetailType, type McpToolConfigType } from '@fastgpt/global/core/app/type';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { isEqual } from 'lodash';
import { type ClientSession } from 'mongoose';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { onDelOneApp } from '../del';
import { onCreateApp } from '../create';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

import {
  getMCPToolRuntimeNode,
  getMCPToolSetRuntimeNode
} from '@fastgpt/global/core/app/mcpTools/utils';
import { type MCPToolSetData } from '@/pageComponents/dashboard/apps/MCPToolsEditModal';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { storeSecretValue } from '@fastgpt/service/common/secret/utils';

export type updateMCPToolsQuery = {};

export type updateMCPToolsBody = {
  appId: string;
  url: string;
  headerSecret: StoreSecretValueType;
  toolList: McpToolConfigType[];
};

export type updateMCPToolsResponse = {};

async function handler(
  req: ApiRequestProps<updateMCPToolsBody, updateMCPToolsQuery>,
  res: ApiResponseType<updateMCPToolsResponse>
): Promise<updateMCPToolsResponse> {
  const { appId, url, toolList, headerSecret } = req.body;
  const { app } = await authApp({ req, authToken: true, appId, per: ManagePermissionVal });

  const toolSetNode = app.modules.find((item) => item.flowNodeType === FlowNodeTypeEnum.toolSet);
  const toolSetData = toolSetNode?.inputs[0].value as MCPToolSetData;

  const formatedHeaderAuth = storeSecretValue(headerSecret);

  await mongoSessionRun(async (session) => {
    if (
      !isEqual(toolSetData, {
        url,
        toolList
      })
    ) {
      await updateMCPChildrenTool({
        parentApp: app,
        toolSetData: {
          url,
          toolList,
          headerSecret: formatedHeaderAuth
        },
        session
      });
    }

    // create tool set node
    const toolSetRuntimeNode = getMCPToolSetRuntimeNode({
      url,
      toolList,
      headerSecret: formatedHeaderAuth,
      name: app.name,
      avatar: app.avatar
    });

    // update app and app version
    await Promise.all([
      MongoApp.updateOne(
        { _id: appId },
        {
          modules: [toolSetRuntimeNode],
          updateTime: new Date()
        },
        { session }
      ),

      MongoAppVersion.updateOne(
        { appId },
        {
          $set: {
            nodes: [toolSetRuntimeNode]
          }
        },
        { session }
      )
    ]);
  });

  return {};
}

export default NextAPI(handler);

const updateMCPChildrenTool = async ({
  parentApp,
  toolSetData,
  session
}: {
  parentApp: AppDetailType;
  toolSetData: {
    url: string;
    toolList: McpToolConfigType[];
    headerSecret: StoreSecretValueType;
  };
  session: ClientSession;
}) => {
  const { teamId, tmbId } = parentApp;
  const dbTools = await MongoApp.find({
    parentId: parentApp._id,
    teamId
  });

  // 删除 DB 里有，新的工具列表里没有的工具
  for await (const tool of dbTools) {
    if (!toolSetData.toolList.find((t) => t.name === tool.name)) {
      await onDelOneApp({
        teamId,
        appId: tool._id,
        session
      });
    }
  }

  // 创建 DB 里没有，新的工具列表里有的工具
  for await (const tool of toolSetData.toolList) {
    if (!dbTools.find((t) => t.name === tool.name)) {
      await onCreateApp({
        name: tool.name,
        avatar: parentApp.avatar,
        parentId: parentApp._id,
        teamId,
        tmbId,
        type: AppTypeEnum.tool,
        intro: tool.description,
        modules: [
          getMCPToolRuntimeNode({
            tool,
            url: toolSetData.url,
            headerSecret: toolSetData.headerSecret
          })
        ],
        session
      });
    }
  }

  // 更新 DB 里有的工具
  for await (const tool of toolSetData.toolList) {
    const dbTool = dbTools.find((t) => t.name === tool.name);
    if (dbTool) {
      await MongoApp.updateOne(
        { _id: dbTool._id },
        {
          modules: [
            getMCPToolRuntimeNode({
              tool,
              url: toolSetData.url,
              headerSecret: toolSetData.headerSecret
            })
          ]
        },
        { session }
      );
      await MongoAppVersion.updateOne(
        { appId: dbTool._id },
        {
          nodes: [
            getMCPToolRuntimeNode({
              tool,
              url: toolSetData.url,
              headerSecret: toolSetData.headerSecret
            })
          ]
        },
        { session }
      );
    }
  }
};
