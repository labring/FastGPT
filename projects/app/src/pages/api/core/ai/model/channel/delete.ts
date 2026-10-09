import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelManage } from '@fastgpt/service/support/permission/model/auth';
import { deleteChannel } from '@fastgpt/service/core/ai/model/channel/service';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  DeleteChannelQuerySchema,
  DeleteChannelResponseSchema,
  type DeleteChannelQuery,
  type DeleteChannelResponse
} from '@fastgpt/global/openapi/core/ai/model/channel/api';

/** 删除渠道：删除前计算并返回受影响的模型清单 */
async function handler(
  req: ApiRequestProps<Record<string, never>, DeleteChannelQuery>
): Promise<DeleteChannelResponse> {
  const { id, channelType } = parseApiInput({
    req,
    querySchema: DeleteChannelQuerySchema
  }).query;

  const { tmbId, teamId } = await authModelManage({ req, channelType, resource: 'channel' });

  return DeleteChannelResponseSchema.parse(await deleteChannel({ id, channelType, tmbId, teamId }));
}

export default NextAPI(handler);
