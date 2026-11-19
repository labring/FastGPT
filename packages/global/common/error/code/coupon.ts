import { i18nT } from '../../i18n/utils';
import type { ErrorHttpStatus, ErrType } from '../errorCode';

/* coupon: 512000 */
export enum CouponErrEnum {
  invalid = 'invalidCoupon'
}

const couponErr: Array<{
  statusText: CouponErrEnum;
  message: string;
  httpStatus: ErrorHttpStatus;
}> = [
  {
    statusText: CouponErrEnum.invalid,
    message: i18nT('common:coupon_invalid'),
    httpStatus: 400
  }
];

export default couponErr.reduce(
  (acc, cur, index) => ({
    ...acc,
    [cur.statusText]: {
      code: 512000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null,
      httpStatus: cur.httpStatus
    }
  }),
  {} as ErrType<`${CouponErrEnum}`>
);
