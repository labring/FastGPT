import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelManage } from '@fastgpt/service/support/permission/model/auth';
import { batchOperateChannels } from '@fastgpt/service/core/ai/model/channel/service';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  BatchChannelBodySchema,
  BatchDeleteChannelsResponseSchema,
  type BatchChannelBody,
  type BatchChannelResponse
} from '@fastgpt/global/openapi/core/ai/model/channel/api';

/** 批量操作渠道（批量删除 / 批量启用停用） */
async function handler(req: ApiRequestProps<BatchChannelBody>): Promise<BatchChannelResponse> {
  const body = parseApiInput({ req, bodySchema: BatchChannelBodySchema }).body;
  const { channelType, action } = body;

  const { tmbId, teamId } = await authModelManage({ req, channelType, resource: 'channel' });

  const result = await batchOperateChannels({ body, tmbId, teamId });
  return action === 'delete'
    ? BatchDeleteChannelsResponseSchema.parse({ affectedModels: result.affectedModels })
    : undefined;
}

export default NextAPI(handler);
