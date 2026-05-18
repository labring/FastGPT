import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getModelById } from '@fastgpt/service/core/ai/model';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { getTmbPermission } from '@fastgpt/service/support/permission/controller';
import {
  ManagePermissionVal,
  PerResourceTypeEnum,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';

export type deleteQuery = {};

export type deleteBody = {
  id: string;
};

export type deleteResponse = {};

async function handler(
  req: ApiRequestProps<deleteBody, deleteQuery>,
  res: ApiResponseType<any>
): Promise<deleteResponse> {
  const { tmbId, teamId, isRoot } = await authUserPer({
    req,
    authToken: true,
    per: WritePermissionVal
  });

  const { id } = req.body;

  const modelItem = getModelById(id);
  if (!modelItem) return Promise.reject(new Error('Model not found'));
  if (!modelItem.id) return Promise.reject(new Error('System model cannot be deleted'));

  const dbModel = await MongoSystemModel.findById(modelItem.id).lean();
  if (!dbModel) return Promise.reject(new Error('Model not found'));
  const _id = dbModel._id;

  // Root can delete any model
  if (!isRoot) {
    if (modelItem.isCustom === false) {
      return Promise.reject(new Error('System model cannot be deleted'));
    }
    if (String(dbModel.tmbId) !== String(tmbId)) {
      const tmbPer = await getTmbPermission({
        resourceType: PerResourceTypeEnum.model,
        teamId,
        tmbId,
        resourceId: String(_id)
      });
      if (!tmbPer || !(tmbPer & ManagePermissionVal)) {
        return Promise.reject(new Error('No permission to delete this model'));
      }
    }
  }

  await MongoSystemModel.deleteOne({ _id });
  await MongoResourcePermission.deleteMany({
    resourceType: PerResourceTypeEnum.model,
    resourceId: _id
  });

  await updatedReloadSystemModel();

  return {};
}

export default NextAPI(handler);
