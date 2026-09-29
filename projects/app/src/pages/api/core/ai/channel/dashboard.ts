import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelScopeOperation } from '@fastgpt/service/support/permission/model/controller';
import { normalizeAiproxyError } from '@fastgpt/service/core/ai/channel/error';
import { getChannelDashboard } from '@fastgpt/service/core/ai/channel/observability';
import { resolveChannelObservabilityScope } from '@fastgpt/service/core/ai/channel/resolve';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetChannelDashboardQuerySchema,
  GetChannelDashboardResponseSchema,
  type GetChannelDashboardQuery,
  type GetChannelDashboardResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/**
 * 查询当前登录成员可访问范围内的渠道监控数据。
 * channelId 会在请求 aiproxy 前按 system/当前成员 group bucket 校验归属。
 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetChannelDashboardQuery>
): Promise<GetChannelDashboardResponse> {
  const query = parseApiInput({ req, querySchema: GetChannelDashboardQuerySchema }).query;
  const { channelType, channelId, ...filters } = query;
  const { tmbId, isRoot } = await authModelScopeOperation({ req, channelType });
  const { groupId } = await resolveChannelObservabilityScope({
    channelType,
    channelId,
    tmbId,
    isRoot
  });

  let result: GetChannelDashboardResponse;
  try {
    result = await getChannelDashboard({ ...filters, channelId, groupId });
  } catch (error) {
    return Promise.reject(normalizeAiproxyError(error));
  }

  return GetChannelDashboardResponseSchema.parse(result);
}

export default NextAPI(handler);
