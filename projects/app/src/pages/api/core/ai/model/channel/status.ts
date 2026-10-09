import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelManage } from '@fastgpt/service/support/permission/model/auth';
import { updateChannelStatus } from '@fastgpt/service/core/ai/model/channel/service';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateChannelStatusBodySchema,
  type UpdateChannelStatusBody
} from '@fastgpt/global/openapi/core/ai/model/channel/api';

/** 切换渠道启用/禁用状态 */
async function handler(req: ApiRequestProps<UpdateChannelStatusBody>): Promise<void> {
  const { id, status, channelType } = parseApiInput({
    req,
    bodySchema: UpdateChannelStatusBodySchema
  }).body;

  const { tmbId } = await authModelManage({ req, channelType, resource: 'channel' });

  await updateChannelStatus({ id, status, channelType, tmbId });
}

export default NextAPI(handler);
