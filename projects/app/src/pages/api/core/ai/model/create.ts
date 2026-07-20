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

  // Non-root users: strip price fields and force isSystem=false
  if (!isRoot) {
    delete (body as any).charsPointsPrice;
    delete (body as any).priceTiers;
    delete (body as any).inputPrice;
    delete (body as any).outputPrice;
    body.isSystem = false;
  }

  // Root creating a system model: enforce name uniqueness
  if (isRoot && body.isSystem && body.name) {
    const existing = await MongoSystemModel.findOne({
      name: body.name,
      isSystem: true
    }).lean();
    if (existing) {
      return Promise.reject(ModelErrEnum.modelNameConflict);
    }
  }

  const modelData = normalizeSystemModel(body as unknown as Record<string, unknown>);

  const isSystem = body.isSystem ?? false;

  const modelId = await mongoSessionRun(async (session) => {
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
