import { PermissionTypeEnum } from './constant';

/* team public source, or owner source in team */
export function mongoRPermission({ teamId, tmbId }: { teamId: string; tmbId: string }) {
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
