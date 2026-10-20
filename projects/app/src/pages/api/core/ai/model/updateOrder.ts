import { authModelConfig } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  UpdateModelOrderBodySchema,
  type UpdateModelOrderBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { updateModelOrder } from '@fastgpt/service/core/ai/model/service';

/** 校验并保存当前模型作用域的完整展示顺序，避免筛选列表覆盖未展示模型。 */
async function handler(req: ApiRequestProps<UpdateModelOrderBody>): Promise<void> {
  const { modelIds, channelType } = parseApiInput({
    req,
    bodySchema: UpdateModelOrderBodySchema
  }).body;
  const {
    actor: { tmbId, teamId }
  } = await authModelConfig({ req, modelIds, channelType });

  await updateModelOrder({
    modelIds,
    channelType,
    teamId,
    tmbId
  });
}

export default NextAPI(handler);
