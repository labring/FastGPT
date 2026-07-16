import { NextAPI } from '@/service/middleware/entry';
import {
  ListTeamPluginTagsResponseSchema,
  type ListTeamPluginTagsResponseType
} from '@fastgpt/global/openapi/core/plugin/team/tag/api';
import { listTeamPluginTags } from '@fastgpt/service/core/plugin/teamPluginPolicy';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { ApiRequestProps } from '@fastgpt/next/type';

export type ListTeamPluginTagsBody = Record<string, never>;
export type ListTeamPluginTagsQuery = Record<string, never>;
export type ListTeamPluginTagsResponse = ListTeamPluginTagsResponseType;

async function handler(
  req: ApiRequestProps<ListTeamPluginTagsBody, ListTeamPluginTagsQuery>
): Promise<ListTeamPluginTagsResponse> {
  const { teamId } = await authCert({ req, authToken: true });
  const tags = await listTeamPluginTags(teamId);

  return ListTeamPluginTagsResponseSchema.parse(tags);
}

export default NextAPI(handler);
