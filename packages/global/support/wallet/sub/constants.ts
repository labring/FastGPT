export const POINTS_SCALE = 10000;

export enum SubTypeEnum {
  standard = 'standard',
  extraDatasetSize = 'extraDatasetSize',
  extraPoints = 'extraPoints'
}
export const subTypeMap = {
  [SubTypeEnum.standard]: {
    label: 'support.wallet.subscription.type.standard'
  },
  [SubTypeEnum.extraDatasetSize]: {
    label: 'support.wallet.subscription.type.extraDatasetSize'
  },
  [SubTypeEnum.extraPoints]: {
    label: 'support.wallet.subscription.type.extraPoints'
  }
};

export enum SubStatusEnum {
  active = 'active',
  canceled = 'canceled'
}
export const subStatusMap = {
  [SubStatusEnum.active]: {
    label: 'support.wallet.subscription.status.active'
  },
  [SubStatusEnum.canceled]: {
    label: 'support.wallet.subscription.status.canceled'
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
    label: 'support.wallet.subscription.mode.month',
    durationMonth: 1
  },
  [SubModeEnum.year]: {
    label: 'support.wallet.subscription.mode.year',
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
    label: 'support.wallet.subscription.standardSubLevel.free',
    desc: 'support.wallet.subscription.standardSubLevel.free desc'
  },
  [StandardSubLevelEnum.experience]: {
    label: 'support.wallet.subscription.standardSubLevel.experience',
    desc: 'support.wallet.subscription.standardSubLevel.experience desc'
  },
  [StandardSubLevelEnum.team]: {
    label: 'support.wallet.subscription.standardSubLevel.team',
    desc: ''
  },
  [StandardSubLevelEnum.enterprise]: {
    label: 'support.wallet.subscription.standardSubLevel.enterprise',
    desc: ''
  },
  [StandardSubLevelEnum.custom]: {
    label: 'support.wallet.subscription.standardSubLevel.custom',
    desc: ''
  }
};
