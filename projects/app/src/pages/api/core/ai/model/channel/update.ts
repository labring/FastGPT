import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelManage } from '@fastgpt/service/support/permission/model/auth';
import { updateChannel } from '@fastgpt/service/core/ai/model/channel/service';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateChannelBodySchema,
  type UpdateChannelBody
} from '@fastgpt/global/openapi/core/ai/model/channel/api';

/** 更新渠道配置 */
async function handler(req: ApiRequestProps<UpdateChannelBody>): Promise<void> {
  const body = parseApiInput({ req, bodySchema: UpdateChannelBodySchema }).body;
  const { id, channelType, ...patch } = body;

  const { tmbId } = await authModelManage({ req, channelType, resource: 'channel' });
  await updateChannel({ id, channelType, tmbId, channelData: patch });
}

export default NextAPI(handler);
