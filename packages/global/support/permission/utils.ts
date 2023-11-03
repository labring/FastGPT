import { PermissionTypeEnum } from './constant';

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
