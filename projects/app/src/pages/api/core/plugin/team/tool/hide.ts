import { NextAPI } from '@/service/middleware/entry';
import {
  HideTeamSystemToolBodySchema,
  type HideTeamSystemToolBodyType
} from '@fastgpt/global/openapi/core/plugin/team/tool/api';
import {
  TeamPluginEmptyResponseSchema,
  type TeamPluginEmptyResponseType
} from '@fastgpt/global/openapi/core/plugin/team/common';
import { TeamPluginManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  getRawPluginIdFromSystemToolId,
  setTeamSystemPluginHidden
} from '@fastgpt/service/core/plugin/teamPluginPolicy';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';

export type HideTeamSystemToolBody = HideTeamSystemToolBodyType;
export type HideTeamSystemToolResponse = TeamPluginEmptyResponseType;

async function handler(
  req: ApiRequestProps<HideTeamSystemToolBody>
): Promise<HideTeamSystemToolResponse> {
  const {
    body: { pluginId, hidden }
  } = parseApiInput({
    req,
    bodySchema: HideTeamSystemToolBodySchema
  });

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    per: TeamPluginManagePermissionVal
  });

  await setTeamSystemPluginHidden({
    teamId,
    tmbId,
    pluginId: getRawPluginIdFromSystemToolId(pluginId),
    hidden
  });

  return TeamPluginEmptyResponseSchema.parse(undefined);
}

export default NextAPI(handler);
