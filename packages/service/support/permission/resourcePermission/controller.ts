import { ResourcePermissionType } from '@fastgpt/global/support/permission/type';
import { MongoResourcePermission } from './schema';
import { ResourceTypeEnum } from '@fastgpt/global/support/permission/constant';

export async function getResourcePermission({
  tmbId,
  resourceType,
  resourceId,
  teamId
}: {
  tmbId: string;
  resourceType: ResourceTypeEnum;
  resourceId?: string;
  teamId?: string;
}) {
  return (await MongoResourcePermission.findOne({
    tmbId,
    teamId,
    resourceType,
    resourceId
  })) as ResourcePermissionType | null;
}
