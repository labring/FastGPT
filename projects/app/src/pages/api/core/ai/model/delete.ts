import { deleteModels } from '@fastgpt/service/core/ai/model/mutation';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  assertMemberModelPermission,
  authModelScopeOperation
} from '@fastgpt/service/support/permission/model/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  ModelReferenceSchema,
  DeleteModelsBodySchema,
  type ModelReference,
  type DeleteModelsBody
} from '@fastgpt/global/openapi/core/ai/model/api';

async function handler(req: ApiRequestProps<DeleteModelsBody, ModelReference>): Promise<void> {
  const { modelIds, channelType = 'system' } = (() => {
    if (Array.isArray(req.body?.modelIds)) {
      return parseApiInput({ req, bodySchema: DeleteModelsBodySchema }).body;
    }
    const { modelId, channelType } = parseApiInput({
      req,
      querySchema: ModelReferenceSchema
    }).query;
    return { modelIds: [modelId], channelType };
  })();

  const { tmbId, tmb, isRoot } = await authModelScopeOperation({
    req,
    channelType
  });

  if (!isRoot) {
    await assertMemberModelPermission(tmb.permission);
  }

  return deleteModels({
    modelIds,
    channelType,
    tmbId: channelType === 'team' ? tmbId : undefined
  });
}

export default NextAPI(handler);
