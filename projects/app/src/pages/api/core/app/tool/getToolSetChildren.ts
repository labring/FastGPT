import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getMCPChildren } from '@fastgpt/service/core/app/mcp';
import { getHTTPToolList } from '@fastgpt/service/core/app/http';
import {
  GetToolSetChildrenQuerySchema,
  GetToolSetChildrenResponseSchema,
  type GetToolSetChildrenQueryType,
  type GetToolSetChildrenResponseType
} from '@fastgpt/global/openapi/core/app/tool/api';

/** 使用父资源读权限加载当前子工具，并在响应边界仅投影展示字段；普通目录不返回 App 配置。 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetToolSetChildrenQueryType>
): Promise<GetToolSetChildrenResponseType> {
  const { appId, searchKey } = parseApiInput({
    req,
    querySchema: GetToolSetChildrenQuerySchema
  }).query;
  const { app } = await authApp({ req, authToken: true, appId, per: ReadPermissionVal });
  const tools = await (async () => {
    if (app.type === AppTypeEnum.mcpToolSet) return getMCPChildren(app);
    if (app.type === AppTypeEnum.httpToolSet) return getHTTPToolList(app);
    return [];
  })();
  const keyword = searchKey?.trim().toLowerCase();
  return GetToolSetChildrenResponseSchema.parse({
    type: app.type,
    tools: tools.filter((tool) => !keyword || tool.name.toLowerCase().includes(keyword))
  });
}

export default NextAPI(handler);
