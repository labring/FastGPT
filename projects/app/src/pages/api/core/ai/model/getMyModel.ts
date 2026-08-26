import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getMyModelIds } from '@fastgpt/service/support/permission/model/controller';
import {
  GetMyModelQuerySchema,
  GetMyModelResponseSchema,
  type GetMyModelQuery,
  type GetMyModelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { findModelData } from '@fastgpt/service/core/ai/model';

/** 根据稳定 ID 获取分页之外的已选模型。 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetMyModelQuery>
): Promise<GetMyModelResponse> {
  const { modelId } = parseApiInput({ req, querySchema: GetMyModelQuerySchema }).query;
  const { teamId, tmbId, isRoot, tmb } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });
  const model = findModelData({ modelId });
  if (!model || !model.isActive) throw new UserError(ModelErrEnum.unExist);

  const allowedModelIds = new Set(
    await getMyModelIds({
      teamId,
      tmbId,
      isTeamOwner: tmb.role === 'owner' || isRoot
    })
  );
  if (!allowedModelIds.has(model.modelId)) throw new UserError(ModelErrEnum.unExist);

  return GetMyModelResponseSchema.parse(model);
}

export default NextAPI(handler);
