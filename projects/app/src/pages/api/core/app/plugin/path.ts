import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ParentIdType, ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { getSystemPlugins } from '@/service/core/app/plugin';

export type pathQuery = {
  parentId: ParentIdType;
};

export type pathBody = {};

export type pathResponse = Promise<ParentTreePathItemType[]>;

async function handler(
  req: ApiRequestProps<pathBody, pathQuery>,
  res: ApiResponseType<any>
): Promise<pathResponse> {
  const { parentId } = req.query;

  if (!parentId) return [];

  const plugins = await getSystemPlugins();
  const plugin = plugins.find((item) => item.id === parentId);

  if (!plugin) return [];

  return [
    {
      parentId: plugin.id,
      parentName: plugin.name
    }
  ];
}

export default NextAPI(handler);
