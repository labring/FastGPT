import { NextAPI } from '@/service/middleware/entry';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/types';
import type {
  GetAdminSystemToolVersionsQueryType,
  GetAdminSystemToolVersionsResponseType
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import {
  GetAdminSystemToolVersionsQuerySchema,
  GetAdminSystemToolVersionsResponseSchema
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

export type getSystemToolVersionsQuery = GetAdminSystemToolVersionsQueryType;

export type getSystemToolVersionsBody = Record<string, never>;

export type getSystemToolVersionsResponse = GetAdminSystemToolVersionsResponseType;

async function handler(
  req: ApiRequestProps<getSystemToolVersionsBody, getSystemToolVersionsQuery>,
  _res: ApiResponseType<any>
): Promise<getSystemToolVersionsResponse> {
  const {
    query: { toolId }
  } = parseApiInput({
    req,
    querySchema: GetAdminSystemToolVersionsQuerySchema
  });
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
