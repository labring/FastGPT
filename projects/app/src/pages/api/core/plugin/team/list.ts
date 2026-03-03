import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  TeamPluginListItemSchema,
  type GetTeamSystemPluginListQueryType,
  type GetTeamPluginListResponseType
} from '@fastgpt/global/openapi/core/plugin/team/api';
import { getSystemToolsWithInstalled } from '@fastgpt/service/core/app/tool/controller';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { getUserDetail } from '@fastgpt/service/support/user/controller';

export type listQuery = GetTeamSystemPluginListQueryType;

export type listBody = {};

export type listResponse = GetTeamPluginListResponseType;

async function handler(
  req: ApiRequestProps<listBody, listQuery>,
  res: ApiResponseType<any>
): Promise<listResponse> {
  const type = req.query.type;
  const lang = getLocale(req);

  const { teamId, isRoot, tmbId } = await authCert({ req, authToken: true });

  if (type === 'tool') {
    // Get user tags for filtering
    const userDetail = await getUserDetail({ tmbId });
    const userTags = userDetail.tags || [];

    const tools = await getSystemToolsWithInstalled({ teamId, isRoot, userTags });

    return tools
      .filter((tool) => {
        // Only return the top-level tools
        if (tool.parentId) return false;
        // Uninstall & Offline tool, filter out
        if (!tool.installed && tool.status !== PluginStatusEnum.Normal) return false;
        return true;
      })
      .map((tool) => {
        // Check if this tool should be promoted for current user
        const isPromotedForUser =
          userTags.length > 0 &&
          tool.promoteTags &&
          tool.promoteTags.length > 0 &&
          tool.promoteTags.some((promoteTag) => userTags.includes(promoteTag));

        return TeamPluginListItemSchema.parse({
          ...tool,
          name: parseI18nString(tool.name, lang),
          intro: parseI18nString(tool.intro, lang),
          isPromoted: isPromotedForUser
        });
      });
  }

  return [];
}

export default NextAPI(handler);
