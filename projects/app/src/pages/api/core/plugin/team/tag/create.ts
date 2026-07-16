import { NextAPI } from '@/service/middleware/entry';
import {
  CreateTeamPluginTagBodySchema,
  TeamPluginTagItemSchema,
  type CreateTeamPluginTagBodyType,
  type TeamPluginTagItemType
} from '@fastgpt/global/openapi/core/plugin/team/tag/api';
import { TeamPluginManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createTeamPluginTag } from '@fastgpt/service/core/plugin/teamPluginPolicy';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';

export type CreateTeamPluginTagBody = CreateTeamPluginTagBodyType;
export type CreateTeamPluginTagResponse = TeamPluginTagItemType;

async function handler(
  req: ApiRequestProps<CreateTeamPluginTagBody>
): Promise<CreateTeamPluginTagResponse> {
  const {
    body: { tagName }
  } = parseApiInput({
    req,
    bodySchema: CreateTeamPluginTagBodySchema
  });

  const { teamId } = await authUserPer({
    req,
    authToken: true,
    per: TeamPluginManagePermissionVal
  });
  const tag = await createTeamPluginTag({ teamId, tagName });

  return TeamPluginTagItemSchema.parse(tag);
}

export default NextAPI(handler);
