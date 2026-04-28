import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type {
  GetAdminSystemToolDetailQueryType,
  GetAdminSystemToolDetailResponseType
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
import type { AdminSystemToolDetailType } from '@fastgpt/global/core/app/tool/systemTool/type';
import { AdminSystemToolDetailSchema } from '@fastgpt/global/core/app/tool/systemTool/type';

export type getSystemToolDetailQuery = GetAdminSystemToolDetailQueryType;

export type getSystemToolDetailBody = {};

export type getSystemToolsResponse = GetAdminSystemToolDetailResponseType;

async function handler(
  req: ApiRequestProps<getSystemToolDetailBody, getSystemToolDetailQuery>,
  res: ApiResponseType<any>
): Promise<getSystemToolsResponse> {
  const { toolId, version } = req.query;
  const lang = getLocale(req);

  await authSystemAdmin({ req });

  const systemToolRepo = SystemToolRepo.getInstance();
  const tool = await systemToolRepo.getSystemToolDetail({
    pluginId: toolId,
    lang,
    source: 'system',
    version
  });

  return AdminSystemToolDetailSchema.parse({
    ...tool
  } satisfies AdminSystemToolDetailType);
}

export default NextAPI(handler);
