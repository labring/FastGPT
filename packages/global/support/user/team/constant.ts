export enum TeamMemberRoleEnum {
  owner = 'owner',
  member = 'member',
  visitor = 'visitor'
}
export const TeamMemberRoleMap = {
  [TeamMemberRoleEnum.owner]: {
    value: TeamMemberRoleEnum.owner,
    label: 'user.team.role.Owner'
  },
  [TeamMemberRoleEnum.member]: {
    value: TeamMemberRoleEnum.member,
    label: 'user.team.role.Member'
  },
  [TeamMemberRoleEnum.visitor]: {
    value: TeamMemberRoleEnum.visitor,
    label: 'user.team.role.Visitor'
  }
};

export enum TeamMemberStatusEnum {
  waiting = 'waiting',
  active = 'active',
  reject = 'reject'
}
export const TeamMemberStatusMap = {
  [TeamMemberStatusEnum.waiting]: {
    label: 'user.team.member.waiting',
    color: 'orange.600'
  },
  [TeamMemberStatusEnum.active]: {
    label: 'user.team.member.active',
    color: 'green.600'
  },
  [TeamMemberStatusEnum.reject]: {
    label: 'user.team.member.reject',
    color: 'red.600'
  }
};
