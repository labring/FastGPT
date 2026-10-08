import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelManage } from '@fastgpt/service/support/permission/model/controller';
import { createChannel } from '@fastgpt/service/core/ai/channel/service';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  CreateChannelBodySchema,
  type CreateChannelBody
} from '@fastgpt/global/openapi/core/ai/model/channel/api';

/** 创建渠道：root 创建系统渠道，成员创建私有团队分组渠道 */
async function handler(req: ApiRequestProps<CreateChannelBody>): Promise<void> {
  const body = parseApiInput({ req, bodySchema: CreateChannelBodySchema }).body;
  const { channelType, ...channelData } = body;

  const { tmbId } = await authModelManage({ req, channelType, resource: 'channel' });

  await createChannel({ channelType, tmbId, channelData });
}

export default NextAPI(handler);
