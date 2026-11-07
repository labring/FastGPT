import { authModelScope } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  CreateChannelBodySchema,
  CreateChannelResponseSchema,
  type CreateChannelBody,
  type CreateChannelResponse
} from '@fastgpt/global/openapi/core/ai/model/channel/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createChannel } from '@fastgpt/service/core/ai/model/channel/service';

/** 创建渠道：root 创建系统渠道，成员创建私有团队分组渠道 */
async function handler(req: ApiRequestProps<CreateChannelBody>): Promise<CreateChannelResponse> {
  const body = parseApiInput({ req, bodySchema: CreateChannelBodySchema }).body;
  const { channelType, ...channelData } = body;

  const { tmbId } = await authModelScope({ req, channelType });

  return CreateChannelResponseSchema.parse(
    await createChannel({ channelType, tmbId, channelData })
  );
}

export default NextAPI(handler);
