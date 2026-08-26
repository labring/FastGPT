import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { resolveChannelObservabilityScope } from '@/service/core/ai/channel/resolve';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { normalizeAiproxyError, searchChannelLogs } from '@fastgpt/service/core/ai/channel';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetChannelLogsQuerySchema,
  GetChannelLogsResponseSchema,
  type GetChannelLogsQuery,
  type GetChannelLogsResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/**
 * 查询当前登录成员可访问范围内的渠道日志。
 * system 仅 root；team 始终由会话 tmbId 推导 group，客户端无法指定任意 group。
 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetChannelLogsQuery>,
  _res: ApiResponseType<any>
): Promise<GetChannelLogsResponse> {
  const query = parseApiInput({ req, querySchema: GetChannelLogsQuerySchema }).query;
  const { channelType, channelId, ...filters } = query;
  const { tmbId, isRoot } = await authUserPer({ req, authToken: true });
  const { groupId } = await resolveChannelObservabilityScope({
    channelType,
    channelId,
    tmbId,
    isRoot
  });

  let result: GetChannelLogsResponse;
  try {
    result = await searchChannelLogs({ ...filters, channelId, groupId });
  } catch (error) {
    return Promise.reject(normalizeAiproxyError(error));
  }

  return GetChannelLogsResponseSchema.parse(result);
}

export default NextAPI(handler);
