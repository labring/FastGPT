import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { getSystemTools } from '@fastgpt/service/core/app/tool/controller';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type {
  GetAdminSystemToolDetailQueryType,
  GetAdminSystemToolDetailResponseType
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import {
  AdminSystemToolDetailSchema,
  ToolsetChildSchema
} from '@fastgpt/global/core/plugin/admin/tool/type';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { MongoSystemTool } from '@fastgpt/service/core/plugin/tool/systemToolSchema';

export type getSystemToolDetailQuery = GetAdminSystemToolDetailQueryType;

export type getSystemToolDetailBody = {};

export type getSystemToolsResponse = GetAdminSystemToolDetailResponseType;

async function handler(
  req: ApiRequestProps<getSystemToolDetailBody, getSystemToolDetailQuery>,
  res: ApiResponseType<any>
): Promise<getSystemToolsResponse> {
  const toolId = req.query.toolId;
  const lang = getLocale(req);

  await authSystemAdmin({ req });

  const [systemTools, systemDbTool] = await Promise.all([
    getSystemTools(),
    MongoSystemTool.findOne(
      {
        pluginId: toolId
      },
      '_id pluginId inputListVal'
    )
  ]);

  const systemTool = systemTools.find((tool) => tool.id === toolId);

  if (!systemTool) {
    return Promise.reject(PluginErrEnum.unExist);
  }

  const childTools = systemTool.isFolder
    ? systemTools.filter((tool) => tool.parentId === systemTool.id)
    : [];

  return AdminSystemToolDetailSchema.parse({
    ...systemTool,
    name: parseI18nString(systemTool.name, lang),
    intro: parseI18nString(systemTool.intro, lang),
    inputListVal: systemDbTool?.inputListVal,
    childTools: childTools.map((tool) => {
      return ToolsetChildSchema.parse({
        pluginId: tool.id,
        name: parseI18nString(tool.name, lang),
        systemKeyCost: tool.systemKeyCost
      });
    }),
    tags: systemTool.tags || []
  });
}

export default NextAPI(handler);
