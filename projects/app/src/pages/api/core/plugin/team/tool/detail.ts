import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  GetTeamToolDetailQuerySchema,
  TeamToolDetailSchema,
  type GetTeamToolDetailQueryType,
  type GetTeamToolDetailResponseType
} from '@fastgpt/global/openapi/core/plugin/team/tool/api';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { isDebugToolSource, isTeamPluginSource } from '@fastgpt/global/core/app/tool/utils';
import {
  assertTeamPluginSourceAccess,
  getRawPluginIdFromSystemToolId,
  normalizeTeamPluginStatus
} from '@fastgpt/service/core/plugin/teamPluginPolicy';

export type detailQuery = GetTeamToolDetailQueryType;

export type detailBody = Record<string, never>;

export type detailResponse = GetTeamToolDetailResponseType;

async function handler(req: ApiRequestProps<detailBody, detailQuery>): Promise<detailResponse> {
  const {
    query: { toolId, source, version }
  } = parseApiInput({
    req,
    querySchema: GetTeamToolDetailQuerySchema
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

  const tool = await systemToolRepo.getSystemToolDetail({
    pluginId: toolId,
    lang,
    source: getQuerySource(source),
    version
  });

  return TeamToolDetailSchema.parse({
    ...tool,
    status: isTeamPluginSource(source) ? normalizeTeamPluginStatus(tool.status) : tool.status
  });
}

export default NextAPI(handler);

function getQuerySource(source?: string) {
  if (isTeamPluginSource(source) || isDebugToolSource(source)) return source;
  return 'system';
}
