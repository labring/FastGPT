import { authModelScope } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  UpdateChannelStatusBodySchema,
  type UpdateChannelStatusBody
} from '@fastgpt/global/openapi/core/ai/model/channel/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { updateChannelStatus } from '@fastgpt/service/core/ai/model/channel/service';

/** 切换渠道启用/禁用状态 */
async function handler(req: ApiRequestProps<UpdateChannelStatusBody>): Promise<void> {
  const { id, status, channelType } = parseApiInput({
    req,
    bodySchema: UpdateChannelStatusBodySchema
  }).body;

  const { tmbId } = await authModelScope({ req, channelType });

  await updateChannelStatus({ id, status, channelType, tmbId });
}

export default NextAPI(handler);
