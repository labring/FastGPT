import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  assertMemberModelPermission,
  authModelScopeOperation
} from '@fastgpt/service/support/permission/model/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateModelBodySchema,
  type UpdateModelBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import { updateModel } from '@fastgpt/service/core/ai/model/mutation';

async function handler(req: ApiRequestProps<UpdateModelBody>): Promise<void> {
  const input = parseApiInput({
    req,
    bodySchema: UpdateModelBodySchema
  }).body;
  const { channelType = 'system' } = input;

  const { tmbId, tmb, isRoot } = await authModelScopeOperation({
    req,
    channelType
  });

  if (!isRoot) {
    await assertMemberModelPermission(tmb.permission);
  }

  await updateModel({
    ...input,
    channelType,
    tmbId: channelType === 'team' ? tmbId : undefined
  });
}

export default NextAPI(handler);
