import { ResourcePermissionType } from '@fastgpt/global/support/permission/type';
import { MongoResourcePermission } from './schema';
import { ResourceTypeEnum } from '@fastgpt/global/support/permission/constant';

export async function getResourcePermission({
  tmbId,
  resourceType
}: {
  tmbId: string;
  resourceType: ResourceTypeEnum;
}) {
  return (await MongoResourcePermission.findOne({
    tmbId,
    resourceType
  })) as ResourcePermissionType;
}
