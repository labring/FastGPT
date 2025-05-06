import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type AppDetailType, type ToolType } from '@fastgpt/global/core/app/type';
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

export type updateMCPToolsQuery = {};

export type updateMCPToolsBody = {
  appId: string;
  url: string;
  toolList: ToolType[];
};

export type updateMCPToolsResponse = {};

async function handler(
  req: ApiRequestProps<updateMCPToolsBody, updateMCPToolsQuery>,
  res: ApiResponseType<updateMCPToolsResponse>
): Promise<updateMCPToolsResponse> {
  const { appId, url, toolList } = req.body;
  const { app } = await authApp({ req, authToken: true, appId, per: ManagePermissionVal });

  const toolSetNode = app.modules.find((item) => item.flowNodeType === FlowNodeTypeEnum.toolSet);
  const toolSetData = toolSetNode?.inputs[0].value as MCPToolSetData;

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
          toolList
        },
        session
      });
    }

    await MongoApp.findByIdAndUpdate(
      appId,
      {
        modules: [getMCPToolSetRuntimeNode({ url, toolList, name: app.name, avatar: app.avatar })]
      },
      { session }
    );

    await MongoAppVersion.updateOne(
      {
        appId
      },
      {
        $set: {
          nodes: [getMCPToolSetRuntimeNode({ url, toolList, name: app.name, avatar: app.avatar })]
        }
      },
      { session }
    );
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
  toolSetData: MCPToolSetData;
  session: ClientSession;
}) => {
  const { teamId, tmbId } = parentApp;
  const dbTools = await MongoApp.find({
    parentId: parentApp._id,
    teamId
  });

  for await (const tool of dbTools) {
    if (!toolSetData.toolList.find((t) => t.name === tool.name)) {
      await onDelOneApp({
        teamId,
        appId: tool._id,
        session
      });
    }
  }

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
        modules: [getMCPToolRuntimeNode({ tool, url: toolSetData.url })],
        session
      });
    }
  }

  for await (const tool of toolSetData.toolList) {
    const dbTool = dbTools.find((t) => t.name === tool.name);
    if (dbTool) {
      await MongoApp.findByIdAndUpdate(
        dbTool._id,
        {
          modules: [getMCPToolRuntimeNode({ tool, url: toolSetData.url })]
        },
        { session }
      );
    }
  }
};
