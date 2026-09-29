import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelScopeOperation } from '@fastgpt/service/support/permission/model/controller';
import { normalizeAiproxyError } from '@fastgpt/service/core/ai/channel/error';
import { getChannelLogDetail } from '@fastgpt/service/core/ai/channel/observability';
import { resolveChannelObservabilityScope } from '@fastgpt/service/core/ai/channel/resolve';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetChannelLogDetailQuerySchema,
  GetChannelLogDetailResponseSchema,
  type GetChannelLogDetailQuery,
  type GetChannelLogDetailResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/**
 * 获取当前登录成员可访问范围内的日志详情。
 * team 详情请求由 aiproxy group-channel 路径再次按服务端 groupId 约束 logId。
 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetChannelLogDetailQuery>
): Promise<GetChannelLogDetailResponse> {
  const { id, channelType } = parseApiInput({
    req,
    querySchema: GetChannelLogDetailQuerySchema
  }).query;
  const { tmbId, isRoot } = await authModelScopeOperation({ req, channelType });
  const { groupId } = await resolveChannelObservabilityScope({
    channelType,
    tmbId,
    isRoot
  });

  let result: GetChannelLogDetailResponse;
  try {
    result = await getChannelLogDetail({ id, groupId });
  } catch (error) {
    return Promise.reject(normalizeAiproxyError(error));
  }

  return GetChannelLogDetailResponseSchema.parse(result);
}

export default NextAPI(handler);
