export enum InformTypeEnum {
  system = 'system'
}

export const InformTypeMap = {
  [InformTypeEnum.system]: {
    label: '系统通知'
  }
};

export enum TeamMemberRoleEnum {
  owner = 'owner',
  admin = 'admin',
  member = 'member',
  visitor = 'visitor'
}
export const TeamMemberRoleMap = {
  [TeamMemberRoleEnum.owner]: {
    label: 'user.team.role.owner'
  },
  [TeamMemberRoleEnum.admin]: {
    label: 'user.team.role.admin'
  },
  [TeamMemberRoleEnum.member]: {
    label: 'user.team.role.member'
  },
  [TeamMemberRoleEnum.visitor]: {
    label: 'user.team.role.visitor'
  }
};
