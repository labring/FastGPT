import { NextAPI } from '@/service/middleware/entry';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  GetTeamToolVersionsQuerySchema,
  GetTeamToolVersionsResponseSchema,
  type GetTeamToolVersionsQueryType,
  type GetTeamToolVersionsResponseType
} from '@fastgpt/global/openapi/core/plugin/team/tool/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { isDebugToolSource, isTeamPluginSource } from '@fastgpt/global/core/app/tool/utils';
import {
  assertTeamPluginSourceAccess,
  getRawPluginIdFromSystemToolId
} from '@fastgpt/service/core/plugin/teamPluginPolicy';

export type getSystemToolVersionsQuery = GetTeamToolVersionsQueryType;

export type getSystemToolVersionsBody = Record<string, never>;

export type getSystemToolVersionsResponse = GetTeamToolVersionsResponseType;

async function handler(
  req: ApiRequestProps<getSystemToolVersionsBody, getSystemToolVersionsQuery>
): Promise<getSystemToolVersionsResponse> {
  const {
    query: { toolId, source }
  } = parseApiInput({
    req,
    querySchema: GetTeamToolVersionsQuerySchema
  });
  const lang = getLocale(req);

  const { teamId } = await authCert({ req, authToken: true });
  if (isTeamPluginSource(source)) {
    await assertTeamPluginSourceAccess({
      teamId,
      source,
      pluginId: getRawPluginIdFromSystemToolId(toolId)
    });
  }

  const systemToolRepo = SystemToolRepo.getInstance();
  const versions = await systemToolRepo.getVersions({
    pluginId: toolId,
    source: getQuerySource(source),
    lang
  });

  return GetTeamToolVersionsResponseSchema.parse(versions);
}

export default NextAPI(handler);

function getQuerySource(source?: string) {
  if (isTeamPluginSource(source) || isDebugToolSource(source)) return source;
  return 'system';
}
