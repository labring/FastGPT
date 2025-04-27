import { i18nT } from '../../../../web/i18n/utils';
import { BillTypeEnum } from '../bill/constants';

export enum SubTypeEnum {
  standard = 'standard',
  extraDatasetSize = 'extraDatasetSize',
  extraPoints = 'extraPoints'
}

export const subTypeMap = {
  [SubTypeEnum.standard]: {
    label: 'support.wallet.subscription.type.standard',
    icon: 'support/account/plans',
    orderType: BillTypeEnum.standSubPlan
  },
  [SubTypeEnum.extraDatasetSize]: {
    label: 'support.wallet.subscription.type.extraDatasetSize',
    icon: 'core/dataset/datasetLight',
    orderType: BillTypeEnum.extraDatasetSub
  },
  [SubTypeEnum.extraPoints]: {
    label: 'support.wallet.subscription.type.extraPoints',
    icon: 'core/chat/chatLight',
    orderType: BillTypeEnum.extraPoints
  }
};

export enum SubModeEnum {
  month = 'month',
  year = 'year'
}
export const subModeMap = {
  [SubModeEnum.month]: {
    label: 'support.wallet.subscription.mode.Month',
    durationMonth: 1,
    payMonth: 1
  },
  [SubModeEnum.year]: {
    label: 'support.wallet.subscription.mode.Year',
    durationMonth: 12,
    payMonth: 10
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
    label: i18nT('common:support.wallet.subscription.standardSubLevel.free'),
    desc: i18nT('common:support.wallet.subscription.standardSubLevel.free desc'),
    weight: 1
  },
  [StandardSubLevelEnum.experience]: {
    label: i18nT('common:support.wallet.subscription.standardSubLevel.experience'),
    desc: i18nT('common:support.wallet.subscription.standardSubLevel.experience_desc'),
    weight: 2
  },
  [StandardSubLevelEnum.team]: {
    label: i18nT('common:support.wallet.subscription.standardSubLevel.team'),
    desc: i18nT('common:support.wallet.subscription.standardSubLevel.team_desc'),
    weight: 3
  },
  [StandardSubLevelEnum.enterprise]: {
    label: i18nT('common:support.wallet.subscription.standardSubLevel.enterprise'),
    desc: i18nT('common:support.wallet.subscription.standardSubLevel.enterprise_desc'),
    weight: 4
  },
  [StandardSubLevelEnum.custom]: {
    label: i18nT('common:support.wallet.subscription.standardSubLevel.custom'),
    desc: '',
    weight: 5
  }
};
