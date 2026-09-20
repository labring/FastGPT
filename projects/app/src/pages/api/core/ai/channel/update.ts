import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  normalizeAiproxyError,
  updateGroupChannel,
  updateSystemChannel,
  type AddChannelData
} from '@fastgpt/service/core/ai/channel';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { resolveChannelForOperation } from '@/service/core/ai/channel/resolve';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateChannelBodySchema,
  UpdateChannelResponseSchema,
  type UpdateChannelBody,
  type UpdateChannelResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/** 更新渠道配置 */
async function handler(req: ApiRequestProps<UpdateChannelBody>): Promise<UpdateChannelResponse> {
  const body = parseApiInput({ req, bodySchema: UpdateChannelBodySchema }).body;
  const { id, channelType, ...patch } = body;

  if (id === undefined || channelType === undefined) {
    return Promise.reject(ModelErrEnum.channelNotExist);
  }

  const { tmbId, isRoot } = await authUserPer({ req, authToken: true });
  if (channelType === 'system' && !isRoot) {
    return Promise.reject(ModelErrEnum.rootOnlyPermit);
  }

  const resolved = await resolveChannelForOperation({ id, channelType, tmbId, isRoot });

  // Full-replacement PUT: the required channel fields must be present in the body
  if (
    patch.name === undefined ||
    patch.type === undefined ||
    patch.key === undefined ||
    patch.models === undefined
  ) {
    return Promise.reject(ModelErrEnum.invalidModelConfig);
  }

  const updateData: AddChannelData = {
    name: patch.name,
    type: patch.type,
    key: patch.key,
    models: patch.models,
    ...(patch.base_url !== undefined && { base_url: patch.base_url }),
    ...(patch.model_mapping !== undefined && { model_mapping: patch.model_mapping }),
    ...(patch.priority !== undefined && { priority: patch.priority }),
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.sets !== undefined && { sets: patch.sets }),
    ...(patch.configs !== undefined && { configs: patch.configs })
  };

  try {
    if (resolved.kind === 'system') {
      await updateSystemChannel(id, updateData);
    } else {
      await updateGroupChannel(resolved.groupId, id, updateData);
    }
  } catch (error) {
    return Promise.reject(normalizeAiproxyError(error));
  }

  return UpdateChannelResponseSchema.parse(undefined);
}

export default NextAPI(handler);
