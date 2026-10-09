import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelManage } from '@fastgpt/service/support/permission/model/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateModelBodySchema,
  type UpdateModelBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import { updateModelWithLifecycle } from '@fastgpt/service/core/ai/model/lifecycle';

async function handler(req: ApiRequestProps<UpdateModelBody>): Promise<void> {
  const input = parseApiInput({
    req,
    bodySchema: UpdateModelBodySchema
  }).body;
  const { channelType } = input;

  const { tmbId, teamId } = await authModelManage({ req, channelType });

  await updateModelWithLifecycle({
    ...input,
    channelType,
    teamId,
    tmbId: channelType === 'team' ? tmbId : undefined
  });
}

export default NextAPI(handler);
