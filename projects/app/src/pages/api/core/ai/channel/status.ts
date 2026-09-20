import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelScopeOperation } from '@fastgpt/service/support/permission/model/controller';
import { updateChannelStatus } from '@fastgpt/service/core/ai/channel/service';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateChannelStatusBodySchema,
  type UpdateChannelStatusBody
} from '@fastgpt/global/openapi/core/ai/channel/api';

/** 切换渠道启用/禁用状态 */
async function handler(req: ApiRequestProps<UpdateChannelStatusBody>): Promise<void> {
  const { id, status, channelType } = parseApiInput({
    req,
    bodySchema: UpdateChannelStatusBodySchema
  }).body;

  const { tmbId, isRoot } = await authModelScopeOperation({ req, channelType });

  await updateChannelStatus({ id, status, channelType, tmbId, isRoot });
}

export default NextAPI(handler);
