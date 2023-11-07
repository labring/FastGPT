import { TeamMemberRoleEnum } from '../user/team/constant';
import { PermissionTypeEnum } from './constant';

/* team public source, or owner source in team */
export function mongoRPermission({
  teamId,
  tmbId,
  role
}: {
  teamId: string;
  tmbId: string;
  role: `${TeamMemberRoleEnum}`;
}) {
  return {
    teamId,
    ...(role === TeamMemberRoleEnum.visitor && { permission: PermissionTypeEnum.public }),
    ...(role === TeamMemberRoleEnum.admin && {
      $or: [{ permission: PermissionTypeEnum.public }, { tmbId }]
    })
  };
}
export function mongoOwnerPermission({ teamId, tmbId }: { teamId: string; tmbId: string }) {
  return {
    teamId,
    tmbId
  };
}
