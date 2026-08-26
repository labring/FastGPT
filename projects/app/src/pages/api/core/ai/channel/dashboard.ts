import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { resolveChannelObservabilityScope } from '@/service/core/ai/channel/resolve';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getChannelDashboard, normalizeAiproxyError } from '@fastgpt/service/core/ai/channel';
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
  req: ApiRequestProps<Record<string, never>, GetChannelDashboardQuery>,
  _res: ApiResponseType<any>
): Promise<GetChannelDashboardResponse> {
  const query = parseApiInput({ req, querySchema: GetChannelDashboardQuerySchema }).query;
  const { channelType, channelId, ...filters } = query;
  const { tmbId, isRoot } = await authUserPer({ req, authToken: true });
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
