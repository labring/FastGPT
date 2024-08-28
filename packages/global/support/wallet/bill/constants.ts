export enum BillTypeEnum {
  balance = 'balance',
  standSubPlan = 'standSubPlan',
  extraDatasetSub = 'extraDatasetSub',
  extraPoints = 'extraPoints'
}
export const billTypeMap = {
  [BillTypeEnum.balance]: {
    label: 'support.wallet.subscription.type.balance'
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
    label: 'support.wallet.bill.status.success'
  },
  [BillStatusEnum.REFUND]: {
    label: 'support.wallet.bill.status.refund'
  },
  [BillStatusEnum.NOTPAY]: {
    label: 'support.wallet.bill.status.notpay'
  },
  [BillStatusEnum.CLOSED]: {
    label: 'support.wallet.bill.status.closed'
  }
};

export enum BillPayWayEnum {
  balance = 'balance',
  wx = 'wx'
}

export const billPayWayMap = {
  [BillPayWayEnum.balance]: {
    label: 'support.wallet.bill.payWay.balance'
  },
  [BillPayWayEnum.wx]: {
    label: 'support.wallet.bill.payWay.wx'
  }
};

export const SUB_DATASET_SIZE_RATE = 1000;
export const SUB_EXTRA_POINT_RATE = 1000;
