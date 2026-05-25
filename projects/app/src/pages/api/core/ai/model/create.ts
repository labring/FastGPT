import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamModelCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  CreateModelBodySchema,
  CreateModelResponseSchema,
  type CreateModelBody,
  type CreateModelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { addAuditLog, getI18nModelType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(
  req: ApiRequestProps<CreateModelBody, any>,
  res: ApiResponseType<any>
): Promise<CreateModelResponse> {
  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    per: TeamModelCreatePermissionVal
  });

  const parsed = CreateModelBodySchema.parse(req.body);
  let { model, metadata, isShared = false } = parsed;
  if (!model || !metadata) return Promise.reject(ModelErrEnum.customModelMissingFields);
  model = model.trim();

  const name = metadata?.name?.trim();
  if (!name) return Promise.reject(ModelErrEnum.customModelMissingName);
  if (!metadata.type) return Promise.reject(ModelErrEnum.customModelMissingType);

  metadata.model = model;
  metadata.name = name;
  metadata.isCustom = true;

  const newDoc = await MongoSystemModel.create({
    model,
    metadata,
    tmbId,
    teamId,
    isShared
  });

  const modelId = newDoc._id.toString();
  await MongoResourcePermission.create({
    teamId,
    tmbId,
    resourceType: PerResourceTypeEnum.model,
    resourceId: newDoc._id,
    permission: OwnerRoleVal
  });

  await updatedReloadSystemModel();

  (async () => {
    addAuditLog({
      teamId,
      tmbId,
      event: AuditEventEnum.CREATE_MODEL,
      params: { modelName: name, modelType: getI18nModelType(metadata.type) }
    });
  })();

  return CreateModelResponseSchema.parse({ id: modelId });
}
export default NextAPI(handler);
