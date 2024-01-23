export enum PayTypeEnum {
  balance = 'balance',
  subStandard = 'subStandard',
  subExtraDatasetSize = 'subExtraDatasetSize',
  subExtraPoints = 'subExtraPoints'
}
export const payTypeMap = {
  [PayTypeEnum.balance]: {
    label: 'support.user.team.pay.type.balance'
  },
  [PayTypeEnum.subStandard]: {
    label: 'support.user.team.subscription.type.standard'
  },
  [PayTypeEnum.subExtraDatasetSize]: {
    label: 'support.user.team.subscription.type.extraDatasetSize'
  },
  [PayTypeEnum.subExtraPoints]: {
    label: 'support.user.team.subscription.type.extraPoints'
  }
};

export enum PayStatusEnum {
  SUCCESS = 'SUCCESS',
  REFUND = 'REFUND',
  NOTPAY = 'NOTPAY',
  CLOSED = 'CLOSED'
}
export const payStatusMap = {
  [PayStatusEnum.SUCCESS]: {
    label: 'support.user.team.pay.status.success'
  },
  [PayStatusEnum.REFUND]: {
    label: 'support.user.team.pay.status.refund'
  },
  [PayStatusEnum.NOTPAY]: {
    label: 'support.user.team.pay.status.notpay'
  },
  [PayStatusEnum.CLOSED]: {
    label: 'support.user.team.pay.status.closed'
  }
};
