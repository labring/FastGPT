export enum SubTypeEnum {
  standard = 'standard',
  extraDatasetSize = 'extraDatasetSize',
  extraPoints = 'extraPoints'
}
export const subTypeMap = {
  [SubTypeEnum.standard]: {
    label: 'support.user.team.subscription.type.standard'
  },
  [SubTypeEnum.extraDatasetSize]: {
    label: 'support.user.team.subscription.type.extraDatasetSize'
  },
  [SubTypeEnum.extraPoints]: {
    label: 'support.user.team.subscription.type.extraPoints'
  }
};

export enum SubStatusEnum {
  active = 'active',
  canceled = 'canceled'
}
export const subStatusMap = {
  [SubStatusEnum.active]: {
    label: 'support.user.team.subscription.status.active'
  },
  [SubStatusEnum.canceled]: {
    label: 'support.user.team.subscription.status.canceled'
  }
};
export const subSelectMap = {
  true: SubStatusEnum.active,
  false: SubStatusEnum.canceled
};

export enum SubModeEnum {
  month = 'month',
  year = 'year'
}
export const subModeMap = {
  [SubModeEnum.month]: {
    label: 'support.user.team.subscription.mode.month',
    durationMonth: 1
  },
  [SubModeEnum.year]: {
    label: 'support.user.team.subscription.mode.year',
    durationMonth: 12
  }
};

export enum StandardSubLevelEnum {
  free = 'free',
  experience = 'experience',
  team = 'team',
  enterprise = 'enterprise',
  custom = 'custom'
}
export const standardSubLevelMap = {
  [StandardSubLevelEnum.free]: {
    label: 'support.user.team.subscription.standardSubLevel.free'
  },
  [StandardSubLevelEnum.experience]: {
    label: 'support.user.team.subscription.standardSubLevel.experience'
  },
  [StandardSubLevelEnum.team]: {
    label: 'support.user.team.subscription.standardSubLevel.team'
  },
  [StandardSubLevelEnum.enterprise]: {
    label: 'support.user.team.subscription.standardSubLevel.enterprise'
  },
  [StandardSubLevelEnum.custom]: {
    label: 'support.user.team.subscription.standardSubLevel.custom'
  }
};
