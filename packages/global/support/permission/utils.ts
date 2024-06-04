import { TeamMemberRoleEnum } from '../user/team/constant';
import { PermissionTypeEnum } from './constant';
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
