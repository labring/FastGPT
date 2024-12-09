import { NextAPI } from '@/service/middleware/entry';
import { MongoPluginGroups } from '@fastgpt/service/core/app/plugin/pluginGroupSchema';
import { PluginGroupSchemaType } from '@fastgpt/service/core/app/plugin/type';
import { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';

export type getPluginGroupsQuery = {};

export type getPluginGroupsBody = {};

export type getPluginGroupsResponse = PluginGroupSchemaType[];

async function handler(
  req: ApiRequestProps<getPluginGroupsBody, getPluginGroupsQuery>,
  res: ApiResponseType<any>
): Promise<getPluginGroupsResponse> {
  const pluginGroups = await MongoPluginGroups.find().sort({ groupOrder: 1 });

  const result = pluginGroups.map((item) => ({
    groupId: item.groupId,
    groupName: item.groupName,
    groupAvatar: item.groupAvatar,
    groupTypes: item.groupTypes,
    groupOrder: item.groupOrder
  }));

  return result;
}

export default NextAPI(handler);
