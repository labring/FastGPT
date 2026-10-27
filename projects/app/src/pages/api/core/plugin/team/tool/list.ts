import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  GetTeamSystemPluginListQuerySchema,
  type GetTeamSystemPluginListQueryType,
  GetTeamPluginListResponseSchema,
  type GetTeamPluginListResponseType
} from '@fastgpt/global/openapi/core/plugin/team/tool/api';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import type { UserTagsType } from '@fastgpt/global/support/user/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import {
  getTeamPluginSource,
  isDebugToolSource,
  isTeamPluginSource
} from '@fastgpt/global/core/app/tool/utils';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import {
  getTeamPluginPolicyMap,
  resolveTeamPluginList
} from '@fastgpt/service/core/plugin/teamPluginPolicy';

export type listQuery = GetTeamSystemPluginListQueryType;

export type listBody = Record<string, never>;

export type listResponse = GetTeamPluginListResponseType;

const hasMatchedUserTag = ({
  userTags,
  targetTags
}: {
  userTags: UserTagsType[];
  targetTags?: UserTagsType[] | null;
}) => {
  return !!targetTags?.some((tag) => userTags.includes(tag));
};

async function handler(req: ApiRequestProps<listBody, listQuery>): Promise<listResponse> {
  const lang = getLocale(req);
  const { query } = parseApiInput({
    req,
    querySchema: GetTeamSystemPluginListQuerySchema
  });

  const { teamId, tmbId, permission } = await authUserPer({ req, authToken: true });
  const debugSource = await getActiveDebugSource(tmbId);
  const teamSource = getTeamPluginSource(teamId);

  const systemToolRepo = SystemToolRepo.getInstance();
  const [tools, userDetail, policyMap] = await Promise.all([
    systemToolRepo.getSystemToolList({
      op: 'or',
      // 调试 source 作为额外来源追加，保留 system/team 的生产插件可见性。
      sources: ['system', teamSource, ...(debugSource ? [debugSource] : [])],
      lang
    }),
    getUserDetail({ tmbId }),
    getTeamPluginPolicyMap(teamId)
  ]);
  const userTags = userDetail.tags || [];

  return GetTeamPluginListResponseSchema.parse(
    resolveTeamPluginList({
      teamId,
      tools: tools.filter(
        (tool) =>
          tool.status !== PluginStatusEnum.Hidden && tool.status !== PluginStatusEnum.Offline
      ),
      policyMap,
      filter: query,
      canManage: permission.hasManagePer || permission.isOwner
    })
      .sort((a, b) => getToolListSortOrder(a.source) - getToolListSortOrder(b.source))
      .filter((tool) => {
        if (hasMatchedUserTag({ userTags, targetTags: tool.hideTags })) return false;
        return true;
      })
      .map((tool) => ({
        ...tool,
        isPromoted: hasMatchedUserTag({ userTags, targetTags: tool.promoteTags })
      }))
  );
}

export default NextAPI(handler);

async function getActiveDebugSource(tmbId: string) {
  const status = await pluginClient.getDebugSessionStatus({ tmbId }).catch(() => undefined);

  if (
    status?.enabled &&
    (status.status === 'enabled' || status.status === 'connected') &&
    isDebugToolSource(status.source)
  ) {
    return status.source;
  }
}

/** 团队安装插件优先展示，系统插件置于列表末尾。 */
function getToolListSortOrder(source?: string) {
  if (isTeamPluginSource(source)) return 0;
  if (isDebugToolSource(source)) return 1;
  return 2;
}
