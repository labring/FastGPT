import { NextAPI } from '@/service/middleware/entry';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import {
  GetTeamToolVersionsQuerySchema,
  GetTeamToolVersionsResponseSchema,
  type GetTeamToolVersionsQueryType,
  type GetTeamToolVersionsResponseType
} from '@fastgpt/global/openapi/core/plugin/team/tool/dto';

export type getSystemToolVersionsQuery = GetTeamToolVersionsQueryType;

export type getSystemToolVersionsBody = {};

export type getSystemToolVersionsResponse = GetTeamToolVersionsResponseType;

async function handler(
  req: ApiRequestProps<getSystemToolVersionsBody, getSystemToolVersionsQuery>,
  res: ApiResponseType<any>
): Promise<getSystemToolVersionsResponse> {
  const { toolId, source } = GetTeamToolVersionsQuerySchema.parse(req.query);
  const lang = getLocale(req);

  const { teamId } = await authCert({ req, authToken: true });

  const systemToolRepo = SystemToolRepo.getInstance();
  const versions = await systemToolRepo.getVersions({
    pluginId: toolId,
    source: source === 'team' ? teamId : 'system',
    lang
  });

  return GetTeamToolVersionsResponseSchema.parse(versions);
}

export default NextAPI(handler);
