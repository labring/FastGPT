import { authModelScope } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  UpdateChannelBodySchema,
  type UpdateChannelBody
} from '@fastgpt/global/openapi/core/ai/model/channel/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { updateChannel } from '@fastgpt/service/core/ai/model/channel/service';

/** 更新渠道配置 */
async function handler(req: ApiRequestProps<UpdateChannelBody>): Promise<void> {
  const body = parseApiInput({ req, bodySchema: UpdateChannelBodySchema }).body;
  const { id, channelType, ...patch } = body;

  const { tmbId } = await authModelScope({ req, channelType });
  await updateChannel({ id, channelType, tmbId, channelData: patch });
}

export default NextAPI(handler);
