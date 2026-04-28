import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type { GetAdminSystemToolsResponseType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import { MongoPluginToolTag } from '@fastgpt/service/core/plugin/tool/tagSchema';
import type { AdminSystemToolListItemType } from '@fastgpt/global/core/app/tool/systemTool/type/admin';
import { AdminSystemToolListItemSchema } from '@fastgpt/global/core/app/tool/systemTool/type/admin';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';

export type AdminGetSystemToolsQuery = {};

export type AdminGetSystemToolsBody = {};

export type AdminGetSystemToolsResponse = AdminSystemToolListItemType[];

async function handler(
  req: ApiRequestProps<AdminGetSystemToolsBody, AdminGetSystemToolsQuery>,
  res: ApiResponseType<any>
): Promise<GetAdminSystemToolsResponseType> {
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

  return systemTools.map((item) => {
    return AdminSystemToolListItemSchema.parse({
      ...item,
      name: item.name,
      intro: item.intro,
      needsSystemSecret: !!item.secrets,
      hasSystemSecret: item.hasSystemSecret,
      tags: tags
        .filter((tag) => item.tags?.includes(tag.tagId))
        .map((tag) => parseI18nString(tag.tagName, lang))
    } satisfies AdminSystemToolListItemType);
  });
}

export default NextAPI(handler);
