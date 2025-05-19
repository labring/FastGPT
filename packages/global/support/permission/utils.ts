import { PermissionValueType } from './type';
import { NullPermission, PermissionTypeEnum } from './constant';
import { Permission } from './controller';

/* team public source, or owner source in team */
export function mongoRPermission({
  teamId,
  tmbId,
  permission
}: {
  teamId: string;
  tmbId: string;
  permission: Permission;
}) {
  if (permission.isOwner) {
    return {
      teamId
    };
  }
  return {
    teamId,
    $or: [{ permission: PermissionTypeEnum.public }, { tmbId }]
  };
}
export function mongoOwnerPermission({ teamId, tmbId }: { teamId: string; tmbId: string }) {
  return {
    teamId,
    tmbId
  };
}

// return permission-related schema to define the schema of resources
export function getPermissionSchema(defaultPermission: PermissionValueType = NullPermission) {
  return {
    defaultPermission: {
      type: Number,
      default: defaultPermission
    },
    inheritPermission: {
      type: Boolean,
      default: true
    }
  };
}
