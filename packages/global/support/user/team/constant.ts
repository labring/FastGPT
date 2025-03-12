export const TeamCollectionName = 'teams';
export const TeamMemberCollectionName = 'team_members';
export const TeamTagsCollectionName = 'team_tags';

export enum TeamMemberRoleEnum {
  owner = 'owner'
}

export const TeamMemberRoleMap = {
  [TeamMemberRoleEnum.owner]: {
    value: TeamMemberRoleEnum.owner,
    label: 'user.team.role.Owner'
  }
};

export enum TeamMemberStatusEnum {
  active = 'active',
  leave = 'leave',
  forbidden = 'forbidden'
}

export const TeamMemberStatusMap = {
  [TeamMemberStatusEnum.active]: {
    label: 'user.team.member.active',
    color: 'green.600'
  },
  [TeamMemberStatusEnum.leave]: {
    label: 'user.team.member.leave',
    color: 'red.600'
  },
  [TeamMemberStatusEnum.forbidden]: {
    label: 'user.team.member.forbidden',
    color: 'red.600'
  }
};

export const notLeaveStatus = {
  $not: {
    $in: [TeamMemberStatusEnum.leave, TeamMemberStatusEnum.forbidden]
  }
};
