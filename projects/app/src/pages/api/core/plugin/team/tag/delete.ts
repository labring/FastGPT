import { NextAPI } from '@/service/middleware/entry';
import {
  DeleteTeamPluginTagQuerySchema,
  type DeleteTeamPluginTagQueryType
} from '@fastgpt/global/openapi/core/plugin/team/tag/api';
import {
  TeamPluginEmptyResponseSchema,
  type TeamPluginEmptyResponseType
} from '@fastgpt/global/openapi/core/plugin/team/common';
import { TeamPluginManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { deleteTeamPluginTag } from '@fastgpt/service/core/plugin/teamPluginPolicy';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';

export type DeleteTeamPluginTagBody = Record<string, never>;
export type DeleteTeamPluginTagQuery = DeleteTeamPluginTagQueryType;
export type DeleteTeamPluginTagResponse = TeamPluginEmptyResponseType;

async function handler(
  req: ApiRequestProps<DeleteTeamPluginTagBody, DeleteTeamPluginTagQuery>
): Promise<DeleteTeamPluginTagResponse> {
  const {
    query: { tagId }
  } = parseApiInput({
    req,
    querySchema: DeleteTeamPluginTagQuerySchema
  });

  const { teamId } = await authUserPer({
    req,
    authToken: true,
    per: TeamPluginManagePermissionVal
  });
  await deleteTeamPluginTag({ teamId, tagId });

  return TeamPluginEmptyResponseSchema.parse(undefined);
}

export default NextAPI(handler);
