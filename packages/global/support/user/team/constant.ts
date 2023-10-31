export enum TeamMemberRoleEnum {
  owner = 'owner',
  member = 'member',
  visitor = 'visitor'
}
export const TeamMemberRoleMap = {
  [TeamMemberRoleEnum.owner]: {
    value: TeamMemberRoleEnum.owner,
    label: 'user.team.role.owner'
  },
  [TeamMemberRoleEnum.member]: {
    value: TeamMemberRoleEnum.member,
    label: 'user.team.role.member'
  },
  [TeamMemberRoleEnum.visitor]: {
    value: TeamMemberRoleEnum.visitor,
    label: 'user.team.role.visitor'
  }
};

export enum TeamMemberStatusEnum {
  waiting = 'waiting',
  active = 'active'
}
export const TeamMemberStatusMap = {
  [TeamMemberStatusEnum.waiting]: {
    label: 'user.team.status.waiting'
  },
  [TeamMemberStatusEnum.active]: {
    label: 'user.team.status.active'
  }
};
