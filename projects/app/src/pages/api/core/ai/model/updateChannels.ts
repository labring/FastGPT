import { authModelConfig } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  UpdateModelChannelsBodySchema,
  type UpdateModelChannelsBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { updateModelChannelBindings } from '@fastgpt/service/core/ai/model/channel/binding';

/**
 * 追加或解除模型与渠道的关联。
 * 统一校验配置权限与操作作用域后，按模型名维护渠道绑定。
 */
async function handler(req: ApiRequestProps<UpdateModelChannelsBody>): Promise<void> {
  const { modelId, channelType, addChannelIds, removeChannelIds } = parseApiInput({
    req,
    bodySchema: UpdateModelChannelsBodySchema
  }).body;

  const {
    actor: { tmbId },
    models: [model]
  } = await authModelConfig({ req, modelIds: [modelId], channelType });

  await updateModelChannelBindings({
    model: model.model,
    addChannelIds,
    removeChannelIds,
    channelType,
    tmbId
  });
}

export default NextAPI(handler);
