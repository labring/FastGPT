import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  GetTeamSystemPluginListQuerySchema,
  type GetTeamSystemPluginListQueryType,
  GetTeamPluginListResponseSchema,
  type GetTeamPluginListResponseType
} from '@fastgpt/global/openapi/core/plugin/team/tool/api';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import type { UserTagsType } from '@fastgpt/global/support/user/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';

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
  parseApiInput({
    req,
    querySchema: GetTeamSystemPluginListQuerySchema
  });

  const { teamId, tmbId } = await authCert({ req, authToken: true });
  const debugSource = await getActiveDebugSource(tmbId);

  const systemToolRepo = SystemToolRepo.getInstance();
  const [tools, userDetail] = await Promise.all([
    systemToolRepo.getSystemToolList({
      op: 'or',
      // 调试 source 作为额外来源追加，保留 system/team 的生产插件可见性。
      sources: ['system', teamId, ...(debugSource ? [debugSource] : [])],
      lang
    }),
    getUserDetail({ tmbId })
  ]);
  const userTags = userDetail.tags || [];

  return GetTeamPluginListResponseSchema.parse(
    tools
      .sort((a, b) => Number(isDebugSource(b.source)) - Number(isDebugSource(a.source)))
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

function isDebugSource(source?: string) {
  return !!source?.startsWith('debug:');
}

async function getActiveDebugSource(tmbId: string) {
  const status = await pluginClient.getDebugSessionStatus({ tmbId }).catch(() => undefined);

  if (
    status?.enabled &&
    (status.status === 'enabled' || status.status === 'connected') &&
    status.source
  ) {
    return status.source;
  }
}
