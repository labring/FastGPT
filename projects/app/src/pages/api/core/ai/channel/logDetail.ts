import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { resolveChannelObservabilityScope } from '@/service/core/ai/channel/resolve';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getChannelLogDetail, normalizeAiproxyError } from '@fastgpt/service/core/ai/channel';
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
  req: ApiRequestProps<Record<string, never>, GetChannelLogDetailQuery>,
  _res: ApiResponseType<any>
): Promise<GetChannelLogDetailResponse> {
  const { id, channelType } = parseApiInput({
    req,
    querySchema: GetChannelLogDetailQuerySchema
  }).query;
  const { tmbId, isRoot } = await authUserPer({ req, authToken: true });
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
