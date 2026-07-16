import { NextAPI } from '@/service/middleware/entry';
import {
  UpdateTeamToolTagsBodySchema,
  type UpdateTeamToolTagsBodyType
} from '@fastgpt/global/openapi/core/plugin/team/tool/api';
import {
  TeamPluginEmptyResponseSchema,
  type TeamPluginEmptyResponseType
} from '@fastgpt/global/openapi/core/plugin/team/common';
import { TeamPluginManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  getRawPluginIdFromSystemToolId,
  updateTeamPluginTags
} from '@fastgpt/service/core/plugin/teamPluginPolicy';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';

export type UpdateTeamToolTagsBody = UpdateTeamToolTagsBodyType;
export type UpdateTeamToolTagsResponse = TeamPluginEmptyResponseType;

async function handler(
  req: ApiRequestProps<UpdateTeamToolTagsBody>
): Promise<UpdateTeamToolTagsResponse> {
  const {
    body: { pluginId, registrySource, teamTagIds }
  } = parseApiInput({
    req,
    bodySchema: UpdateTeamToolTagsBodySchema
  });

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    per: TeamPluginManagePermissionVal
  });

  await updateTeamPluginTags({
    teamId,
    tmbId,
    pluginId: getRawPluginIdFromSystemToolId(pluginId),
    registrySource,
    teamTagIds
  });

  return TeamPluginEmptyResponseSchema.parse(undefined);
}

export default NextAPI(handler);
