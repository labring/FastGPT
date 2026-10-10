import { authModelScope } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  GetChannelLogDetailQuerySchema,
  GetChannelLogDetailResponseSchema,
  type GetChannelLogDetailQuery,
  type GetChannelLogDetailResponse
} from '@fastgpt/global/openapi/core/ai/model/channel/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getChannelLogDetail } from '@fastgpt/service/core/ai/model/channel/observability';
import { resolveChannelObservabilityScope } from '@fastgpt/service/core/ai/model/channel/resolve';

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
  const { tmbId } = await authModelScope({ req, channelType });
  const { groupId } = await resolveChannelObservabilityScope({
    channelType,
    tmbId
  });

  const result = await getChannelLogDetail({ id, groupId });
  return GetChannelLogDetailResponseSchema.parse(result);
}

export default NextAPI(handler);
