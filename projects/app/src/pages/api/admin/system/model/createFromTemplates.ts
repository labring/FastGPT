import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { assertMemberChannelPermission } from '@fastgpt/service/core/ai/channel';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createSystemModelsFromTemplates } from '@/service/core/ai/model/service';
import {
  CreateSystemModelsFromTemplatesBodySchema,
  type CreateSystemModelsFromTemplatesBody,
  CreateSystemModelsFromTemplatesResponseSchema,
  type CreateSystemModelsFromTemplatesResponse
} from '@fastgpt/global/openapi/admin/system/model/api';

async function handler(
  req: ApiRequestProps<CreateSystemModelsFromTemplatesBody>
): Promise<CreateSystemModelsFromTemplatesResponse> {
  const { tmbId, tmb, isRoot } = await authUserPer({ req, authToken: true });
  const { templates, channelType = 'system' } = parseApiInput({
    req,
    bodySchema: CreateSystemModelsFromTemplatesBodySchema
  }).body;

  if (channelType === 'team') {
    if (!isRoot) {
      await assertMemberChannelPermission(tmb.permission);
    }
  } else {
    if (!isRoot) {
      return Promise.reject(ModelErrEnum.rootOnlyPermit);
    }
  }

  return CreateSystemModelsFromTemplatesResponseSchema.parse(
    await createSystemModelsFromTemplates({
      templates,
      channelType,
      tmbId: channelType === 'team' ? tmbId : undefined
    })
  );
}

export default NextAPI(handler);
