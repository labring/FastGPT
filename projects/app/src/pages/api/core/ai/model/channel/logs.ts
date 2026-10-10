import { authModelScope } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  GetChannelLogsQuerySchema,
  GetChannelLogsResponseSchema,
  type GetChannelLogsQuery,
  type GetChannelLogsResponse
} from '@fastgpt/global/openapi/core/ai/model/channel/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { searchChannelLogs } from '@fastgpt/service/core/ai/model/channel/observability';
import { resolveChannelObservabilityScope } from '@fastgpt/service/core/ai/model/channel/resolve';

/**
 * 查询当前登录成员可访问范围内的渠道日志。
 * system 仅 root；team 始终由会话 tmbId 推导 group，客户端无法指定任意 group。
 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetChannelLogsQuery>
): Promise<GetChannelLogsResponse> {
  const query = parseApiInput({ req, querySchema: GetChannelLogsQuerySchema }).query;
  const { channelType, channelId, ...filters } = query;
  const { tmbId } = await authModelScope({ req, channelType });
  const { groupId } = await resolveChannelObservabilityScope({
    channelType,
    channelId,
    tmbId
  });

  const result = await searchChannelLogs({ ...filters, channelId, groupId });
  return GetChannelLogsResponseSchema.parse(result);
}

export default NextAPI(handler);
