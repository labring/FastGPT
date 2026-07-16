import { NextAPI } from '@/service/middleware/entry';
import {
  UpdateTeamPluginTagOrderBodySchema,
  type UpdateTeamPluginTagOrderBodyType
} from '@fastgpt/global/openapi/core/plugin/team/tag/api';
import {
  TeamPluginEmptyResponseSchema,
  type TeamPluginEmptyResponseType
} from '@fastgpt/global/openapi/core/plugin/team/common';
import { TeamPluginManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  updateTeamPluginTagOrder,
  validateTeamPluginTagIds
} from '@fastgpt/service/core/plugin/teamPluginPolicy';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';

export type UpdateTeamPluginTagOrderBody = UpdateTeamPluginTagOrderBodyType;
export type UpdateTeamPluginTagOrderResponse = TeamPluginEmptyResponseType;

async function handler(
  req: ApiRequestProps<UpdateTeamPluginTagOrderBody>
): Promise<UpdateTeamPluginTagOrderResponse> {
  const {
    body: { tagIds }
  } = parseApiInput({
    req,
    bodySchema: UpdateTeamPluginTagOrderBodySchema
  });

  const { teamId } = await authUserPer({
    req,
    authToken: true,
    per: TeamPluginManagePermissionVal
  });
  await validateTeamPluginTagIds({ teamId, teamTagIds: tagIds });
  await updateTeamPluginTagOrder({ teamId, tagIds });

  return TeamPluginEmptyResponseSchema.parse(undefined);
}

export default NextAPI(handler);
