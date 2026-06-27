import { NextAPI } from '@/service/middleware/entry';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  GetTeamToolVersionsQuerySchema,
  GetTeamToolVersionsResponseSchema,
  type GetTeamToolVersionsQueryType,
  type GetTeamToolVersionsResponseType
} from '@fastgpt/global/openapi/core/plugin/team/tool/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { isDebugToolSource } from '@fastgpt/global/core/app/tool/utils';

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

  const systemToolRepo = SystemToolRepo.getInstance();
  const versions = await systemToolRepo.getVersions({
    pluginId: toolId,
    source: getQuerySource({ source, teamId }),
    lang
  });

  return GetTeamToolVersionsResponseSchema.parse(versions);
}

export default NextAPI(handler);

function getQuerySource({ source, teamId }: { source?: string; teamId: string }) {
  if (source === 'team') return teamId;
  if (isDebugToolSource(source)) return source;
  return 'system';
}
