import { PermissionTypeEnum } from './constant';

/* team public source, or owner source in team */
export function mongoRPermission({
  teamId,
  tmbId,
  teamOwner
}: {
  teamId: string;
  tmbId: string;
  teamOwner?: boolean;
}) {
  return {
    teamId,
    ...(!teamOwner && { $or: [{ permission: PermissionTypeEnum.public }, { tmbId }] })
  };
}
export function mongoOwnerPermission({ teamId, tmbId }: { teamId: string; tmbId: string }) {
  return {
    teamId,
    tmbId
  };
}
