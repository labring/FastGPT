import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type {
  GetSystemInstalledPluginsQueryType,
  GetSystemInstalledPluginsResponseType
} from '@fastgpt/global/openapi/core/plugin/marketplace/api';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { APIGetSystemToolList } from '@fastgpt/service/core/app/tool/api';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';

export type installedQuery = GetSystemInstalledPluginsQueryType;

export type installedBody = {};

export type installedResponse = GetSystemInstalledPluginsResponseType;

// 目前只有 tool，所以不需要做判断
export async function handler(
  req: ApiRequestProps<installedBody, installedQuery>,
  res: ApiResponseType<any>
): Promise<installedResponse> {
  await authSystemAdmin({ req });

  const { type } = req.query;

  const tools = await APIGetSystemToolList();

  return {
    list: tools.map((tool) => ({
      id: tool.id.replace(`${AppToolSourceEnum.systemTool}-`, ''),
      version: tool.version
    }))
  };
}

export default NextAPI(handler);
