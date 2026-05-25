import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import {
  WritePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { authModel } from '@fastgpt/service/support/permission/model/auth';
import {
  DeleteModelQuerySchema,
  DeleteModelResponseSchema,
  type DeleteModelQuery,
  type DeleteModelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { addAuditLog, getI18nModelType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(
  req: ApiRequestProps<DeleteModelQuery, DeleteModelQuery>,
  res: ApiResponseType<any>
): Promise<DeleteModelResponse> {
  const { id } = DeleteModelQuerySchema.parse({
    ...req.query,
    ...req.body
  });
  const {
    model: modelItem,
    teamId,
    tmbId
  } = await authModel({
    req,
    authToken: true,
    authApiKey: true,
    modelId: id,
    per: WritePermissionVal
  });

  if (modelItem.isCustom === false) {
    return Promise.reject(ModelErrEnum.systemModelCannotDelete);
  }

  const dbModel = await MongoSystemModel.findById(modelItem.id).lean();
  if (!dbModel) return Promise.reject(ModelErrEnum.unExist);
  const _id = dbModel._id;

  await MongoSystemModel.deleteOne({ _id });
  await MongoResourcePermission.deleteMany({
    resourceType: PerResourceTypeEnum.model,
    resourceId: _id
  });

  await updatedReloadSystemModel();

  (async () => {
    addAuditLog({
      teamId,
      tmbId,
      event: AuditEventEnum.DELETE_MODEL,
      params: { modelName: modelItem.name, modelType: getI18nModelType(modelItem.type) }
    });
  })();

  return DeleteModelResponseSchema.parse({});
}

export default NextAPI(handler);
