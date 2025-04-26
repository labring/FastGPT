import { i18nT } from '../../../../web/i18n/utils';

export enum BillTypeEnum {
  balance = 'balance',
  standSubPlan = 'standSubPlan',
  extraDatasetSub = 'extraDatasetSub',
  extraPoints = 'extraPoints'
}
export const billTypeMap = {
  [BillTypeEnum.balance]: {
    label: i18nT('common:support.wallet.subscription.type.balance')
  },
  [BillTypeEnum.standSubPlan]: {
    label: i18nT('common:support.wallet.subscription.type.standard')
  },
  [BillTypeEnum.extraDatasetSub]: {
    label: i18nT('common:support.wallet.subscription.type.extraDatasetSize')
  },
  [BillTypeEnum.extraPoints]: {
    label: i18nT('common:support.wallet.subscription.type.extraPoints')
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
    label: i18nT('common:support.wallet.bill.status.success')
  },
  [BillStatusEnum.REFUND]: {
    label: i18nT('common:support.wallet.bill.status.refund')
  },
  [BillStatusEnum.NOTPAY]: {
    label: i18nT('common:support.wallet.bill.status.notpay')
  },
  [BillStatusEnum.CLOSED]: {
    label: i18nT('common:support.wallet.bill.status.closed')
  }
};

export enum BillPayWayEnum {
  balance = 'balance',
  wx = 'wx',
  alipay = 'alipay',
  bank = 'bank',
  coupon = 'coupon'
}

export const billPayWayMap = {
  [BillPayWayEnum.balance]: {
    label: i18nT('common:support.wallet.bill.payWay.balance')
  },
  [BillPayWayEnum.wx]: {
    label: i18nT('common:support.wallet.bill.payWay.wx')
  },
  [BillPayWayEnum.alipay]: {
    label: i18nT('common:support.wallet.bill.payWay.alipay')
  },
  [BillPayWayEnum.bank]: {
    label: i18nT('common:support.wallet.bill.payWay.bank')
  },
  [BillPayWayEnum.coupon]: {
    label: i18nT('account_bill:payway_coupon')
  }
};

export const SUB_DATASET_SIZE_RATE = 1000;
export const SUB_EXTRA_POINT_RATE = 1000;
export const MAX_WX_PAY_AMOUNT = 6000;
export const QR_CODE_SIZE = 210;
