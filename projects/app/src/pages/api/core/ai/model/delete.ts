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

export type deleteQuery = {
  id: string;
};

export type deleteBody = {
  id: string;
};

export type deleteResponse = {};

async function handler(
  req: ApiRequestProps<deleteBody, deleteQuery>,
  res: ApiResponseType<any>
): Promise<deleteResponse> {
  const { id } = {
    ...req.query,
    ...req.body
  };
  const { model: modelItem } = await authModel({
    req,
    authToken: true,
    authApiKey: true,
    modelId: id,
    per: WritePermissionVal
  });

  if (modelItem.isCustom === false) {
    return Promise.reject(new Error('System model cannot be deleted'));
  }

  const dbModel = await MongoSystemModel.findById(modelItem.id).lean();
  if (!dbModel) return Promise.reject(new Error('Model not found'));
  const _id = dbModel._id;

  await MongoSystemModel.deleteOne({ _id });
  await MongoResourcePermission.deleteMany({
    resourceType: PerResourceTypeEnum.model,
    resourceId: _id
  });

  await updatedReloadSystemModel();

  return {};
}

export default NextAPI(handler);
