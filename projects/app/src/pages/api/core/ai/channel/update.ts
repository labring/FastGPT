import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelScopeOperation } from '@fastgpt/service/support/permission/model/controller';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { updateChannel } from '@fastgpt/service/core/ai/channel/service';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateChannelBodySchema,
  type UpdateChannelBody
} from '@fastgpt/global/openapi/core/ai/channel/api';

/** 更新渠道配置 */
async function handler(req: ApiRequestProps<UpdateChannelBody>): Promise<void> {
  const body = parseApiInput({ req, bodySchema: UpdateChannelBodySchema }).body;
  const { id, channelType, ...patch } = body;

  if (id === undefined || channelType === undefined) {
    return Promise.reject(ModelErrEnum.channelNotExist);
  }

  const { tmbId, isRoot } = await authModelScopeOperation({ req, channelType });

  // Full-replacement PUT: the required channel fields must be present in the body
  if (
    patch.name === undefined ||
    patch.type === undefined ||
    patch.key === undefined ||
    patch.models === undefined
  ) {
    return Promise.reject(ModelErrEnum.invalidModelConfig);
  }

  const channelData = {
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

  await updateChannel({ id, channelType, tmbId, isRoot, channelData });
}

export default NextAPI(handler);
