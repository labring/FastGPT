import { type PermissionValueType } from './type';
import { NullRoleVal, PermissionTypeEnum } from './constant';
import type { Permission } from './controller';

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
export function getPermissionSchema(defaultPermission: PermissionValueType = NullRoleVal) {
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

export const sumPer = (...per: PermissionValueType[]) => {
  if (per.length === 0) {
    // prevent sum 0 value, to fallback to default value
    return undefined;
  }
  return per.reduce((acc, cur) => acc | cur, 0);
};
