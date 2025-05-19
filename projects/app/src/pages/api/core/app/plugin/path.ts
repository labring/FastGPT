import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { GetPathProps, ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { getSystemPlugins } from '@/service/core/app/plugin';

export type pathQuery = GetPathProps;

export type pathBody = {};

export type pathResponse = Promise<ParentTreePathItemType[]>;

async function handler(
  req: ApiRequestProps<pathBody, pathQuery>,
  res: ApiResponseType<any>
): Promise<pathResponse> {
  const { sourceId: pluginId, type } = req.query;

  if (!pluginId) return [];

  const plugins = await getSystemPlugins();
  const plugin = plugins.find((item) => item.id === pluginId);

  if (!plugin) return [];

  return [
    {
      parentId: type === 'current' ? plugin.id : plugin.parentId,
      parentName: plugin.name
    }
  ];
}

export default NextAPI(handler);
