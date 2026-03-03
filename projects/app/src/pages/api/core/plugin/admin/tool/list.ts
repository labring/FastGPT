import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { getSystemTools } from '@fastgpt/service/core/app/tool/controller';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type {
  GetAdminSystemToolsQueryType,
  GetAdminSystemToolsResponseType
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import { AdminSystemToolListItemSchema } from '@fastgpt/global/core/plugin/admin/tool/type';
import { MongoPluginToolTag } from '@fastgpt/service/core/plugin/tool/tagSchema';

export type getSystemToolsQuery = GetAdminSystemToolsQueryType;

export type getSystemToolsBody = {};

export type getSystemToolsResponse = {};

async function handler(
  req: ApiRequestProps<getSystemToolsBody, getSystemToolsQuery>,
  res: ApiResponseType<any>
): Promise<GetAdminSystemToolsResponseType> {
  const parentId = req.query.parentId;
  const lang = getLocale(req);

  await authSystemAdmin({ req });

  const [systemTools, tags] = await Promise.all([
    getSystemTools(),
    MongoPluginToolTag.find().lean()
  ]);

  return systemTools
    .filter((item) => (parentId ? item.parentId === parentId : !item.parentId))
    .map((item) => {
      return AdminSystemToolListItemSchema.parse({
        ...item,
        name: parseI18nString(item.name, lang),
        intro: parseI18nString(item.intro, lang),
        hasSecretInput: !!item.inputList,
        tags: tags
          .filter((tag) => item.tags?.includes(tag.tagId))
          .map((tag) => parseI18nString(tag.tagName, lang))
      });
    });
}

export default NextAPI(handler);
