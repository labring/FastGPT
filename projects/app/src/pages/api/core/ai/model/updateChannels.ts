import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authAndGetModelInstance } from '@fastgpt/service/support/permission/model/auth';
import { updateModelChannelBindings } from '@fastgpt/service/core/ai/model/channel/binding';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateModelChannelsBodySchema,
  type UpdateModelChannelsBody
} from '@fastgpt/global/openapi/core/ai/model/api';

/**
 * 追加或解除模型与渠道的关联。
 * 统一通过 authAndGetModelInstance 进行鉴权、作用域比对与模型定位。
 */
async function handler(req: ApiRequestProps<UpdateModelChannelsBody>): Promise<void> {
  const { modelId, channelType, addChannelIds, removeChannelIds } = parseApiInput({
    req,
    bodySchema: UpdateModelChannelsBodySchema
  }).body;

  const { tmbId, model } = await authAndGetModelInstance({
    req,
    modelId,
    channelType,
    resource: 'channel'
  });

  await updateModelChannelBindings({
    model: model.model,
    addChannelIds,
    removeChannelIds,
    channelType,
    tmbId
  });
}

export default NextAPI(handler);
