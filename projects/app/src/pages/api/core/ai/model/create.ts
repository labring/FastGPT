import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamModelCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { MongoSystemModel } from '@fastgpt/service/core/ai/model/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { PerResourceTypeEnum, OwnerRoleVal } from '@fastgpt/global/support/permission/constant';
import { normalizeSystemModel } from '@fastgpt/service/core/ai/model/normalize';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/model/utils';
import { getModelDuplicateError } from '@fastgpt/service/core/ai/model/conflict';
import { addAuditLog, getI18nModelType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  CreateModelBodySchema,
  CreateModelResponseSchema,
  type CreateModelBody,
  type CreateModelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';

async function handler(
  req: ApiRequestProps<CreateModelBody>,
  _res: ApiResponseType
): Promise<CreateModelResponse> {
  const body = parseApiInput({ req, bodySchema: CreateModelBodySchema }).body;

  const { teamId, tmbId, isRoot } = await authUserPer({
    req,
    authToken: true,
    per: TeamModelCreatePermissionVal
  });

  // Only root can create system models. Team models never persist platform prices.
  const isSystem = isRoot && body.isSystem === true;

  // Check the same routing scope early for a useful conflict response. The unique
  // partial indexes below remain the authoritative atomic guard for concurrent requests.
  if (isSystem) {
    const existing = await MongoSystemModel.findOne({
      $or: [{ model: body.model }, ...(body.name ? [{ name: body.name }] : [])],
      isSystem: true
    }).lean();
    if (existing) {
      return Promise.reject(
        existing.model === body.model
          ? ModelErrEnum.modelIdConflict
          : ModelErrEnum.modelNameConflict
      );
    }
  } else {
    const existing = await MongoSystemModel.findOne({
      $or: [{ model: body.model }, ...(body.name ? [{ name: body.name }] : [])],
      isSystem: false,
      tmbId
    }).lean();
    if (existing) {
      return Promise.reject(
        existing.model === body.model
          ? ModelErrEnum.modelIdConflict
          : ModelErrEnum.modelNameConflict
      );
    }
  }

  const modelData = normalizeSystemModel({ ...body, isSystem });
  if (!isSystem) {
    delete modelData.charsPointsPrice;
    delete modelData.priceTiers;
    delete modelData.inputPrice;
    delete modelData.outputPrice;
  }

  let modelId: string;
  try {
    modelId = await mongoSessionRun(async (session) => {
      // System models do not maintain tmbId/teamId (design data-model §1.2);
      // only private models (isSystem=false) store the creator's team/tmb.
      const [insertResult] = await MongoSystemModel.create(
        [
          {
            ...modelData,
            isSystem,
            ...(isSystem ? {} : { tmbId, teamId }),
            isActive: body.isActive ?? true,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        { session, ordered: true }
      );
      const newModelId = String(insertResult._id);

      // Write the creator's permission entry for private models (system models store no team/creator)
      // Both writes share the session so a failed permission insert rolls back the model creation.
      if (!isSystem) {
        await MongoResourcePermission.insertOne(
          {
            teamId,
            tmbId,
            resourceId: newModelId,
            resourceType: PerResourceTypeEnum.model,
            permission: OwnerRoleVal
          },
          { session }
        );
      }

      return newModelId;
    });
  } catch (error) {
    const duplicateError = getModelDuplicateError(error);
    if (duplicateError) return Promise.reject(duplicateError);
    throw error;
  }

  await updatedReloadSystemModel();

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_MODEL,
      params: {
        modelName: (modelData as any).name || (modelData as any).model,
        modelType: getI18nModelType((modelData as any).type)
      }
    });
  })();

  return CreateModelResponseSchema.parse({ id: modelId });
}

export default NextAPI(handler);
