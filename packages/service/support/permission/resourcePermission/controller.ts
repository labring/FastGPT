import { ResourcePermissionType } from '@fastgpt/global/support/permission/type';
import { ResourcePermissionModel } from './schema';

export async function getResourcePermission({ tmbId }: { tmbId: string }) {
  return (await ResourcePermissionModel.findOne({
    teamMemberId: tmbId
  }).exec()) as ResourcePermissionType;
}
