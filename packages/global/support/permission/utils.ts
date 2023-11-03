import { PermissionTypeEnum } from './constant';
import { ERROR_ENUM } from 'common/error/errorCode';

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
