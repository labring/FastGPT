import { authModelScope } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  UpdateModelOrderBodySchema,
  type UpdateModelOrderBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { updateModelOrder } from '@fastgpt/service/core/ai/model/service';

/** 鉴权当前管理作用域；具体移动源与锚点由事务内 scope filter 再次校验。 */
async function handler(req: ApiRequestProps<UpdateModelOrderBody>): Promise<void> {
  const { moves, channelType } = parseApiInput({
    req,
    bodySchema: UpdateModelOrderBodySchema
  }).body;
  const { tmbId, teamId } = await authModelScope({ req, channelType });

  await updateModelOrder({
    moves,
    channelType,
    teamId,
    tmbId
  });
}

export default NextAPI(handler);
