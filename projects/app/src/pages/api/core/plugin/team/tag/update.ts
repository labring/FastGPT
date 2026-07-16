import { NextAPI } from '@/service/middleware/entry';
import {
  TeamPluginTagItemSchema,
  UpdateTeamPluginTagBodySchema,
  type TeamPluginTagItemType,
  type UpdateTeamPluginTagBodyType
} from '@fastgpt/global/openapi/core/plugin/team/tag/api';
import { TeamPluginManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { updateTeamPluginTag } from '@fastgpt/service/core/plugin/teamPluginPolicy';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';

export type UpdateTeamPluginTagBody = UpdateTeamPluginTagBodyType;
export type UpdateTeamPluginTagResponse = TeamPluginTagItemType;

async function handler(
  req: ApiRequestProps<UpdateTeamPluginTagBody>
): Promise<UpdateTeamPluginTagResponse> {
  const {
    body: { tagId, tagName }
  } = parseApiInput({
    req,
    bodySchema: UpdateTeamPluginTagBodySchema
  });

  const { teamId } = await authUserPer({
    req,
    authToken: true,
    per: TeamPluginManagePermissionVal
  });
  const tag = await updateTeamPluginTag({ teamId, tagId, tagName });
  if (!tag) {
    return Promise.reject('plugin.team_tag_not_found');
  }

  return TeamPluginTagItemSchema.parse(tag);
}

export default NextAPI(handler);
