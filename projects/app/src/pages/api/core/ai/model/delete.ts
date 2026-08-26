import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { findModelData } from '@fastgpt/service/core/ai/model';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  AdminSystemModelReferenceSchema,
  DeleteAdminSystemModelResponseSchema,
  type AdminSystemModelReference,
  type DeleteAdminSystemModelResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

export type deleteQuery = AdminSystemModelReference;

export type deleteBody = Record<string, never>;

export type deleteResponse = DeleteAdminSystemModelResponse;

async function handler(req: ApiRequestProps<deleteBody, deleteQuery>): Promise<deleteResponse> {
  await authSystemAdmin({ req });

  const reference = parseApiInput({ req, querySchema: AdminSystemModelReferenceSchema }).query;
  const modelData = findModelData(reference);

  if (!modelData) {
    return Promise.reject(ModelErrEnum.unExist);
  }

  if (!modelData.isCustom) {
    return Promise.reject('System model cannot be deleted');
  }

  await MongoSystemModel.deleteOne({ _id: modelData.modelId });

  await updatedReloadSystemModel();

  return DeleteAdminSystemModelResponseSchema.parse({});
}

export default NextAPI(handler);
