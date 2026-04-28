import { NextAPI } from '@/service/middleware/entry';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import type {
  GetAdminSystemToolVersionsQueryType,
  GetAdminSystemToolVersionsResponseType
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import {
  GetAdminSystemToolVersionsQuerySchema,
  GetAdminSystemToolVersionsResponseSchema
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';

export type getSystemToolVersionsQuery = GetAdminSystemToolVersionsQueryType;

export type getSystemToolVersionsBody = {};

export type getSystemToolVersionsResponse = GetAdminSystemToolVersionsResponseType;

async function handler(
  req: ApiRequestProps<getSystemToolVersionsBody, getSystemToolVersionsQuery>,
  res: ApiResponseType<any>
): Promise<getSystemToolVersionsResponse> {
  const { toolId } = GetAdminSystemToolVersionsQuerySchema.parse(req.query);
  const lang = getLocale(req);

  await authSystemAdmin({ req });

  const systemToolRepo = SystemToolRepo.getInstance();
  const versions = await systemToolRepo.getVersions({
    pluginId: toolId,
    source: 'system',
    lang
  });

  return GetAdminSystemToolVersionsResponseSchema.parse(versions);
}

export default NextAPI(handler);
