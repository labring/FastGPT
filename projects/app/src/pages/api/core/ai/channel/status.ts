import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  normalizeAiproxyError,
  updateGroupChannelStatus,
  updateSystemChannelStatus
} from '@fastgpt/service/core/ai/channel';
import { resolveChannelForOperation } from '@/service/core/ai/channel/resolve';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateChannelStatusBodySchema,
  UpdateChannelStatusResponseSchema,
  type UpdateChannelStatusBody,
  type UpdateChannelStatusResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/** 切换渠道启用/禁用状态 */
async function handler(
  req: ApiRequestProps<UpdateChannelStatusBody>
): Promise<UpdateChannelStatusResponse> {
  const { id, status, channelType } = parseApiInput({
    req,
    bodySchema: UpdateChannelStatusBodySchema
  }).body;

  const { tmbId, isRoot } = await authUserPer({ req, authToken: true });
  if (channelType === 'system' && !isRoot) {
    return Promise.reject(ModelErrEnum.rootOnlyPermit);
  }

  const resolved = await resolveChannelForOperation({ id, channelType, tmbId, isRoot });

  try {
    if (resolved.kind === 'system') {
      await updateSystemChannelStatus(id, status);
    } else {
      await updateGroupChannelStatus(resolved.groupId, id, status);
    }
  } catch (error) {
    return Promise.reject(normalizeAiproxyError(error));
  }

  return UpdateChannelStatusResponseSchema.parse(undefined);
}

export default NextAPI(handler);
