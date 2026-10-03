import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  assertMemberModelPermission,
  authModelScopeOperation
} from '@fastgpt/service/support/permission/model/controller';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateModelStatusBodySchema,
  type UpdateModelStatusBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import { updateSystemModelStatus } from '@fastgpt/service/core/ai/model/mutation';

async function handler(req: ApiRequestProps<UpdateModelStatusBody>): Promise<void> {
  const {
    modelIds,
    isActive,
    channelType = 'system'
  } = parseApiInput({
    req,
    bodySchema: UpdateModelStatusBodySchema
  }).body;

  const { tmbId, tmb, isRoot } = await authModelScopeOperation({
    req,
    channelType
  });

  if (!isRoot) {
    await assertMemberModelPermission(tmb.permission);
  }

  await updateSystemModelStatus({
    modelIds,
    isActive,
    scope: channelType === 'team' ? ModelScopeEnum.team : ModelScopeEnum.system,
    tmbId: channelType === 'team' ? tmbId : undefined
  });
}

export default NextAPI(handler);
