import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelManage } from '@fastgpt/service/support/permission/model/controller';
import { searchChannelLogs } from '@fastgpt/service/core/ai/channel/observability';
import { resolveChannelObservabilityScope } from '@fastgpt/service/core/ai/channel/resolve';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetChannelLogsQuerySchema,
  GetChannelLogsResponseSchema,
  type GetChannelLogsQuery,
  type GetChannelLogsResponse
} from '@fastgpt/global/openapi/core/ai/model/channel/api';

/**
 * 查询当前登录成员可访问范围内的渠道日志。
 * system 仅 root；team 始终由会话 tmbId 推导 group，客户端无法指定任意 group。
 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetChannelLogsQuery>
): Promise<GetChannelLogsResponse> {
  const query = parseApiInput({ req, querySchema: GetChannelLogsQuerySchema }).query;
  const { channelType, channelId, ...filters } = query;
  const { tmbId, isRoot } = await authModelManage({ req, channelType, resource: 'channel' });
  const { groupId } = await resolveChannelObservabilityScope({
    channelType,
    channelId,
    tmbId,
    isRoot
  });

  const result = await searchChannelLogs({ ...filters, channelId, groupId });
  return GetChannelLogsResponseSchema.parse(result);
}

export default NextAPI(handler);
