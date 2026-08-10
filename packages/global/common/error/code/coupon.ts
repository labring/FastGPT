import { i18nT } from '../../i18n/utils';
import type { ErrType } from '../errorCode';

/* coupon: 512000 */
export enum CouponErrEnum {
  invalid = 'invalidCoupon'
}

const couponErr = [{ statusText: CouponErrEnum.invalid, message: i18nT('common:coupon_invalid') }];

export default couponErr.reduce(
  (acc, cur, index) => ({
    ...acc,
    [cur.statusText]: {
      code: 512000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  }),
  {} as ErrType<`${CouponErrEnum}`>
);
