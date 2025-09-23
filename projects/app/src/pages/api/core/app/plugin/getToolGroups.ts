import { NextAPI } from '@/service/middleware/entry';
import { MongoToolGroups } from '@fastgpt/service/core/app/plugin/pluginGroupSchema';
import type { SystemToolGroupSchemaType } from '@fastgpt/service/core/app/plugin/type';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';

export type getPluginGroupsQuery = {};

export type getPluginGroupsBody = {};

export type getPluginGroupsResponse = SystemToolGroupSchemaType[];

async function handler(
  req: ApiRequestProps<getPluginGroupsBody, getPluginGroupsQuery>,
  res: ApiResponseType<any>
): Promise<getPluginGroupsResponse> {
  const groups = await MongoToolGroups.find().sort({ groupOrder: 1 });

  return groups
    .map((item) => ({
      groupId: item.groupId,
      groupName: item.groupName,
      groupAvatar: item.groupAvatar,
      groupTypes: item.groupTypes.filter((item) => global.systemToolsTypeCache[item.typeId]),
      groupOrder: item.groupOrder
    }))
    .filter((item) => item.groupTypes.length > 0);
}

export default NextAPI(handler);
