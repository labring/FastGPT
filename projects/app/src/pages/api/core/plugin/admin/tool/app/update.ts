import { NextAPI } from '@/service/middleware/entry';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoSystemTool } from '@fastgpt/service/core/plugin/tool/systemToolSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import {
  UpdateWorkflowToolBodySchema,
  type UpdateWorkflowToolBodyType
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { validateSystemToolWorkflowAssociation } from '@fastgpt/service/core/app/tool/workflowTool/service';

export type updateWorkflowToolQuery = Record<string, never>;

export type updateWorkflowToolBody = UpdateWorkflowToolBodyType;

export type updateWorkflowToolResponse = Record<string, never>;

const omitUndefinedFields = <T extends Record<string, unknown>>(fields: T) =>
  Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  ) as Partial<T>;

export async function handler(
  req: ApiRequestProps<updateWorkflowToolBody, updateWorkflowToolQuery>,
  _res: ApiResponseType<any>
): Promise<updateWorkflowToolResponse> {
  await authSystemAdmin({ req });

  const {
    body: { id: pluginId, ...updateFields }
  } = parseApiInput({
    req,
    bodySchema: UpdateWorkflowToolBodySchema
  });

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
  if (nextCustomConfig.associatedPluginId !== plugin.customConfig.associatedPluginId) {
    await validateSystemToolWorkflowAssociation(nextCustomConfig.associatedPluginId);
  }
  const isUpdateVersion =
    plugin.customConfig.name !== nextCustomConfig.name ||
    plugin.customConfig.avatar !== nextCustomConfig.avatar ||
    plugin.customConfig.intro !== nextCustomConfig.intro;
  const baseUpdateFields = omitUndefinedFields({
    pluginId,
    status: updateFields.status,
    originCost: updateFields.originCost,
    currentCost: updateFields.currentCost,
    hasTokenFee: updateFields.hasTokenFee,
    systemKeyCost: updateFields.systemKeyCost,
    promoteTags: 'promoteTags' in updateFields ? (updateFields.promoteTags ?? null) : undefined,
    hideTags: 'hideTags' in updateFields ? (updateFields.hideTags ?? null) : undefined
  });
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
