import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type {
  GetSystemInstalledPluginsQueryType,
  GetSystemInstalledPluginsResponseType
} from '@fastgpt/global/openapi/core/plugin/marketplace/api';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';

export type installedQuery = GetSystemInstalledPluginsQueryType;

export type installedBody = {};

export type installedResponse = GetSystemInstalledPluginsResponseType;

// 目前只有 tool，所以不需要做判断
export async function handler(
  req: ApiRequestProps<installedBody, installedQuery>,
  res: ApiResponseType<any>
): Promise<installedResponse> {
  await authSystemAdmin({ req });

  const tools = await pluginClient.listTools();

  return {
    list: tools.map((tool) => ({
      id: tool.pluginId,
      version: tool.version ?? '',
      etag: tool.etag,
      name: tool.name,
      description: tool.description,
      icon: tool.icon,
      author: tool.author,
      tags: tool.tags
    }))
  };
}

export default NextAPI(handler);
