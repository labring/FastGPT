export enum BillTypeEnum {
  balance = 'balance',
  standSubPlan = 'standSubPlan',
  extraDatasetSub = 'extraDatasetSub',
  extraPoints = 'extraPoints'
}
export const billTypeMap = {
  [BillTypeEnum.balance]: {
    label: 'support.user.team.pay.type.balance'
  },
  [BillTypeEnum.standSubPlan]: {
    label: 'support.wallet.subscription.type.standard'
  },
  [BillTypeEnum.extraDatasetSub]: {
    label: 'support.wallet.subscription.type.extraDatasetSize'
  },
  [BillTypeEnum.extraPoints]: {
    label: 'support.wallet.subscription.type.extraPoints'
  }
};

export enum BillStatusEnum {
  SUCCESS = 'SUCCESS',
  REFUND = 'REFUND',
  NOTPAY = 'NOTPAY',
  CLOSED = 'CLOSED'
}
export const billStatusMap = {
  [BillStatusEnum.SUCCESS]: {
    label: 'support.user.team.pay.status.success'
  },
  [BillStatusEnum.REFUND]: {
    label: 'support.user.team.pay.status.refund'
  },
  [BillStatusEnum.NOTPAY]: {
    label: 'support.user.team.pay.status.notpay'
  },
  [BillStatusEnum.CLOSED]: {
    label: 'support.user.team.pay.status.closed'
  }
};
