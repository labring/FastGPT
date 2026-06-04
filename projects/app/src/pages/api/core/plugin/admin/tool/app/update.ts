import { NextAPI } from '@/service/middleware/entry';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoSystemTool } from '@fastgpt/service/core/plugin/tool/systemToolSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import {
  UpdateWorkflowToolBodySchema,
  type UpdateWorkflowToolBodyType
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';

export type updateWorkflowToolQuery = {};

export type updateWorkflowToolBody = UpdateWorkflowToolBodyType;

export type updateWorkflowToolResponse = {};

async function handler(
  req: ApiRequestProps<updateWorkflowToolBody, updateWorkflowToolQuery>,
  res: ApiResponseType<any>
): Promise<updateWorkflowToolResponse> {
  await authSystemAdmin({ req });

  const { id: pluginId, ...updateFields } = UpdateWorkflowToolBodySchema.parse(req.body);

  const plugin = await MongoSystemTool.findOne({ pluginId });
  if (!plugin?.customConfig?.associatedPluginId) {
    return Promise.reject('Workflow tool not found');
  }

  const nextCustomConfig = {
    name: updateFields.name ?? plugin.customConfig.name,
    avatar: updateFields.avatar ?? plugin.customConfig.avatar,
    intro: updateFields.intro ?? plugin.customConfig.intro,
    tags: updateFields.tags ?? plugin.customConfig.tags,
    associatedPluginId: updateFields.associatedPluginId ?? plugin.customConfig.associatedPluginId,
    userGuide: updateFields.userGuide ?? plugin.customConfig.userGuide,
    author: updateFields.author ?? plugin.customConfig.author
  };
  const isUpdateVersion =
    plugin.customConfig.name !== nextCustomConfig.name ||
    plugin.customConfig.avatar !== nextCustomConfig.avatar ||
    plugin.customConfig.intro !== nextCustomConfig.intro;
  const baseUpdateFields = {
    pluginId,
    status: updateFields.status,
    originCost: updateFields.originCost,
    currentCost: updateFields.currentCost,
    hasTokenFee: updateFields.hasTokenFee,
    systemKeyCost: updateFields.systemKeyCost,
    promoteTags: updateFields.promoteTags ?? null,
    hideTags: updateFields.hideTags ?? null
  };
  if ('secretsVal' in updateFields) {
    Object.assign(baseUpdateFields, {
      secretsVal: updateFields.secretsVal ?? null
    });
  }

  await MongoSystemTool.findOneAndUpdate(
    { pluginId },
    {
      ...baseUpdateFields,
      customConfig: {
        name: nextCustomConfig.name,
        avatar: nextCustomConfig.avatar,
        intro: nextCustomConfig.intro,
        version: isUpdateVersion ? getNanoid() : plugin.customConfig.version,
        tags: nextCustomConfig.tags,
        associatedPluginId: nextCustomConfig.associatedPluginId,
        userGuide: nextCustomConfig.userGuide,
        author: nextCustomConfig.author
      }
    }
  );

  return {};
}

export default NextAPI(handler);
