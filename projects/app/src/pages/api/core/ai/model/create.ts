import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  assertMemberModelPermission,
  authModelScopeOperation
} from '@fastgpt/service/support/permission/model/controller';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createModel } from '@fastgpt/service/core/ai/model/mutation';
import { appendModelToChannels } from '@fastgpt/service/core/ai/channel/service';
import {
  CreateModelBodySchema,
  type CreateModelBody,
  CreateModelResponseSchema,
  type CreateModelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

async function handler(req: ApiRequestProps<CreateModelBody>): Promise<CreateModelResponse> {
  const body = parseApiInput({
    req,
    bodySchema: CreateModelBodySchema
  }).body as CreateModelBody & { scope?: 'system' | 'team' };
  const { modelData, channelIds } = body;
  const resolvedScope =
    body.scope ?? body.channelType ?? (modelData.scope === ModelScopeEnum.team ? 'team' : 'system');

  const { tmbId, teamId, tmb, isRoot } = await authModelScopeOperation({
    req,
    scope: resolvedScope
  });

  if (!isRoot) {
    await assertMemberModelPermission(tmb.permission);
  }

  if (resolvedScope === 'team') {
    modelData.tmbId = tmbId;
    modelData.teamId = teamId;
    modelData.scope = ModelScopeEnum.team;
  } else {
    modelData.scope = ModelScopeEnum.system;
  }

  const createResult = await createModel({ modelData, channelType: resolvedScope });

  if (channelIds && channelIds.length > 0) {
    await appendModelToChannels({
      channelIds,
      model: modelData.model,
      channelType: resolvedScope,
      tmbId,
      isRoot
    });
  }

  return CreateModelResponseSchema.parse(createResult);
}

export default NextAPI(handler);
