import type { ApiRequestProps } from '@fastgpt/service/type/next';
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

  const systemToolRepo = SystemToolRepo.getInstance();

  const tool = await systemToolRepo.getSystemToolDetail({
    pluginId: toolId,
    lang,
    source: source === 'team' ? teamId : 'system',
    version
  });

  return TeamToolDetailSchema.parse(tool);
}

export default NextAPI(handler);
