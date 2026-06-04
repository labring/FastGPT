import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type {
  GetAdminSystemToolsQueryType,
  GetAdminSystemToolsResponseType
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import { MongoPluginToolTag } from '@fastgpt/service/core/plugin/tool/tagSchema';
import type { AdminSystemToolListItemType } from '@fastgpt/global/core/app/tool/systemTool/type/admin';
import { AdminSystemToolListItemSchema } from '@fastgpt/global/core/app/tool/systemTool/type/admin';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
import {
  GetAdminSystemToolsQuery,
  GetAdminSystemToolsResponseSchema
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';

export type AdminGetSystemToolsQuery = GetAdminSystemToolsQueryType;

export type AdminGetSystemToolsBody = {};

export type AdminGetSystemToolsResponse = AdminSystemToolListItemType[];

export async function handler(
  req: ApiRequestProps<AdminGetSystemToolsBody, AdminGetSystemToolsQuery>,
  res: ApiResponseType<any>
): Promise<GetAdminSystemToolsResponseType> {
  const { searchKey } = GetAdminSystemToolsQuery.parse(req.query);
  const searchRegex = getSearchRegex(searchKey);

  const lang = getLocale(req);

  await authSystemAdmin({ req });

  const systemToolRepo = SystemToolRepo.getInstance();

  const [systemTools, tags] = await Promise.all([
    systemToolRepo.getSystemToolList({
      sources: ['system'],
      lang
    }),
    MongoPluginToolTag.find({}).lean()
  ]);

  const filteredTools = systemTools.filter((item) => filterToolByName(item.name, searchRegex));

  return GetAdminSystemToolsResponseSchema.parse(
    filteredTools.map((item) => {
      return AdminSystemToolListItemSchema.parse({
        ...item,
        name: item.name,
        intro: item.intro,
        systemSecretStatus: item.systemSecretStatus,
        tags: tags
          .filter((tag) => item.tags?.includes(tag.tagId))
          .map((tag) => parseI18nString(tag.tagName, lang))
      } satisfies AdminSystemToolListItemType);
    })
  );
}

export default NextAPI(handler);

function getSearchRegex(searchKey?: string) {
  const trimmedSearchKey = searchKey?.trim();
  if (!trimmedSearchKey) return;
  return new RegExp(replaceRegChars(trimmedSearchKey), 'i');
}

function filterToolByName(name: string, searchRegex?: RegExp) {
  if (!searchRegex) return true;
  return searchRegex.test(name);
}
