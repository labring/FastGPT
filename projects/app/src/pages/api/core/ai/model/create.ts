import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';

export type createQuery = {};
export type createBody = {
  model: string;
  metadata: Record<string, any>;
  isShared?: boolean;
};
export type createResponse = {
  id: string;
};

async function handler(
  req: ApiRequestProps<createBody, createQuery>,
  res: ApiResponseType<any>
): Promise<createResponse> {
  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    per: WritePermissionVal
  });

  let { model, metadata, isShared = false } = req.body;
  if (!model || !metadata) return Promise.reject(new Error('model and metadata are required'));
  model = model.trim();

  const name = metadata?.name?.trim();
  if (!name) return Promise.reject(new Error('metadata.name is required'));
  if (!metadata.type) return Promise.reject(new Error('metadata.type is required'));

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

  return { id: modelId };
}
export default NextAPI(handler);
