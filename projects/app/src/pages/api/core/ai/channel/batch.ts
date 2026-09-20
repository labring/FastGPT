import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelScopeOperation } from '@fastgpt/service/support/permission/model/controller';
import { batchOperateChannels } from '@fastgpt/service/core/ai/channel/service';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  BatchChannelBodySchema,
  BatchDeleteChannelsResponseSchema,
  type BatchChannelBody,
  type BatchChannelResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/** 批量操作渠道（批量删除 / 批量启用停用） */
async function handler(req: ApiRequestProps<BatchChannelBody>): Promise<BatchChannelResponse> {
  const body = parseApiInput({ req, bodySchema: BatchChannelBodySchema }).body;
  const { channelType, action } = body;

  const { tmbId, isRoot } = await authModelScopeOperation({ req, channelType });

  const result = await batchOperateChannels({ body, tmbId, isRoot });
  return action === 'delete'
    ? BatchDeleteChannelsResponseSchema.parse({ affectedModels: result.affectedModels })
    : undefined;
}

export default NextAPI(handler);
