import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  deleteGroupChannel,
  deleteSystemChannel,
  getChannelAffectedModels,
  normalizeAiproxyError
} from '@fastgpt/service/core/ai/channel';
import { resolveChannelForOperation } from '@/service/core/ai/channel/resolve';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  DeleteChannelQuerySchema,
  DeleteChannelResponseSchema,
  type DeleteChannelQuery,
  type DeleteChannelResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/**
 * Delete channel (design §2.9.4).
 * Returns the pre-deletion affected models (models that would lose their only
 * channel — the confirm dialog's data source). Deletion itself is not blocked.
 */
async function handler(
  req: ApiRequestProps<Record<string, never>, DeleteChannelQuery>,
  _res: ApiResponseType<any>
): Promise<DeleteChannelResponse> {
  const { id, channelType } = parseApiInput({
    req,
    querySchema: DeleteChannelQuerySchema
  }).query;

  const { tmbId, isRoot } = await authUserPer({ req, authToken: true });
  if (channelType === 'system' && !isRoot) {
    return Promise.reject(ModelErrEnum.rootOnlyPermit);
  }

  const resolved = await resolveChannelForOperation({ id, channelType, tmbId, isRoot });

  // Affected models are computed before deletion (design §2.9.4 二次确认数据源)
  const affectedModels = await getChannelAffectedModels(resolved.channel);

  try {
    if (resolved.kind === 'system') {
      await deleteSystemChannel(id);
    } else {
      await deleteGroupChannel(resolved.groupId, id);
    }
  } catch (error) {
    return Promise.reject(normalizeAiproxyError(error));
  }

  return DeleteChannelResponseSchema.parse({ affectedModels });
}

export default NextAPI(handler);
