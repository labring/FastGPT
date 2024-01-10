export enum SubTypeEnum {
  datasetStore = 'datasetStore'
}

export const subTypeMap = {
  [SubTypeEnum.datasetStore]: {
    label: 'support.user.team.subscription.type.datasetStore'
  }
};

export enum SubModeEnum {
  month = 'month',
  year = 'year'
}

export const subModeMap = {
  [SubModeEnum.month]: {
    label: 'support.user.team.subscription.mode.month'
  },
  [SubModeEnum.year]: {
    label: 'support.user.team.subscription.mode.year'
  }
};

export enum SubStatusEnum {
  active = 'active',
  expired = 'expired'
}

export const subStatusMap = {
  [SubStatusEnum.active]: {
    label: 'support.user.team.subscription.status.active'
  },
  [SubStatusEnum.expired]: {
    label: 'support.user.team.subscription.status.expired'
  }
};
