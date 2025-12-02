import { i18nT } from '../../../../../web/i18n/utils';

export enum CouponTypeEnum {
  bank = 'bank',
  activity = 'activity'
}

export enum DiscountCouponTypeEnum {
  monthStandardDiscount70 = 'monthStandardDiscount70',
  yearStandardDiscount90 = 'yearStandardDiscount90'
}

export enum DiscountCouponStatusEnum {
  active = 'active',
  used = 'used',
  expired = 'expired',
  notStart = 'notStart'
}
export const discountCouponTypeMap = {
  [DiscountCouponTypeEnum.monthStandardDiscount70]: {
    type: DiscountCouponTypeEnum.monthStandardDiscount70,
    name: i18nT('account:old_user_month_discount_70'),
    description: i18nT('account:old_user_month_discount_70_description'),
    discount: 0.7,
    iconZh: '/imgs/discount70CN.svg',
    iconEn: '/imgs/discount70EN.svg'
  },
  [DiscountCouponTypeEnum.yearStandardDiscount90]: {
    type: DiscountCouponTypeEnum.yearStandardDiscount90,
    name: i18nT('account:old_user_year_discount_90'),
    description: i18nT('account:old_user_year_discount_90_description'),
    discount: 0.9,
    iconZh: '/imgs/discount90CN.svg',
    iconEn: '/imgs/discount90EN.svg'
  }
};
