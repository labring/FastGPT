import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { assertMemberChannelPermission } from '@fastgpt/service/core/ai/channel';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createSystemModel } from '@/service/core/ai/model/service';
import {
  CreateSystemModelBodySchema,
  type CreateSystemModelBody,
  CreateSystemModelResponseSchema,
  type CreateSystemModelResponse
} from '@fastgpt/global/openapi/admin/system/model/api';

async function handler(
  req: ApiRequestProps<CreateSystemModelBody>
): Promise<CreateSystemModelResponse> {
  const { tmbId, tmb, isRoot } = await authUserPer({ req, authToken: true });
  const { modelData, channelType = modelData.scope === ModelScopeEnum.team ? 'team' : 'system' } =
    parseApiInput({
      req,
      bodySchema: CreateSystemModelBodySchema
    }).body;

  if (channelType === 'team') {
    if (!isRoot) {
      await assertMemberChannelPermission(tmb.permission);
    }
    modelData.tmbId = tmbId;
    modelData.scope = ModelScopeEnum.team;
  } else {
    if (!isRoot) {
      return Promise.reject(ModelErrEnum.rootOnlyPermit);
    }
    modelData.scope = ModelScopeEnum.system;
  }

  return CreateSystemModelResponseSchema.parse(await createSystemModel({ modelData, channelType }));
}

export default NextAPI(handler);
