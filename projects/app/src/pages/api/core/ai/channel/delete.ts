import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelScopeOperation } from '@fastgpt/service/support/permission/model/controller';
import { deleteChannel } from '@fastgpt/service/core/ai/channel/service';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  DeleteChannelQuerySchema,
  DeleteChannelResponseSchema,
  type DeleteChannelQuery,
  type DeleteChannelResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/** 删除渠道：删除前计算并返回受影响的模型清单 */
async function handler(
  req: ApiRequestProps<Record<string, never>, DeleteChannelQuery>
): Promise<DeleteChannelResponse> {
  const { id, channelType } = parseApiInput({
    req,
    querySchema: DeleteChannelQuerySchema
  }).query;

  const { tmbId, isRoot } = await authModelScopeOperation({ req, channelType });

  return DeleteChannelResponseSchema.parse(await deleteChannel({ id, channelType, tmbId, isRoot }));
}

export default NextAPI(handler);
