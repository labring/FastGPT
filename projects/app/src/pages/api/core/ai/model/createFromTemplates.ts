import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  assertMemberModelPermission,
  authModelScopeOperation
} from '@fastgpt/service/support/permission/model/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createModelsFromTemplates } from '@fastgpt/service/core/ai/model/mutation';
import {
  CreateModelsFromTemplatesBodySchema,
  type CreateModelsFromTemplatesBody,
  CreateModelsFromTemplatesResponseSchema,
  type CreateModelsFromTemplatesResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

async function handler(
  req: ApiRequestProps<CreateModelsFromTemplatesBody>
): Promise<CreateModelsFromTemplatesResponse> {
  const { templates, channelType = 'system' } = parseApiInput({
    req,
    bodySchema: CreateModelsFromTemplatesBodySchema
  }).body;

  const { tmbId, teamId, tmb, isRoot } = await authModelScopeOperation({
    req,
    channelType
  });

  if (!isRoot) {
    await assertMemberModelPermission(tmb.permission);
  }

  return CreateModelsFromTemplatesResponseSchema.parse(
    await createModelsFromTemplates({
      templates,
      channelType,
      tmbId: channelType === 'team' ? tmbId : undefined,
      teamId: channelType === 'team' ? teamId : undefined
    })
  );
}

export default NextAPI(handler);
