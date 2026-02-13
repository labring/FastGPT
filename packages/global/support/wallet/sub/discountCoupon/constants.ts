import { i18nT } from '../../../../../web/i18n/utils';

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

// Discount coupon type config table, modify to add or update types.
export const discountCouponTypeMap = {
  [DiscountCouponTypeEnum.monthStandardDiscount70]: {
    type: DiscountCouponTypeEnum.monthStandardDiscount70,
    name: i18nT('common:old_user_month_discount_70'),
    description: i18nT('common:old_user_month_discount_70_description'),
    discount: 0.7,
    iconZh: '/imgs/system/discount70CN.svg',
    iconEn: '/imgs/system/discount70EN.svg'
  },
  [DiscountCouponTypeEnum.yearStandardDiscount90]: {
    type: DiscountCouponTypeEnum.yearStandardDiscount90,
    name: i18nT('common:old_user_year_discount_90'),
    description: i18nT('common:old_user_year_discount_90_description'),
    discount: 0.9,
    iconZh: '/imgs/system/discount90CN.svg',
    iconEn: '/imgs/system/discount90EN.svg'
  }
};
