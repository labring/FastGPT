import { useEffect } from 'react';
import { getCouponCode, removeCouponCode } from '@/web/support/marketing/utils';
import { redeemCoupon } from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { CouponErrEnum } from '@fastgpt/global/common/error/code/coupon';

export const useCheckCoupon = () => {
  const { userInfo } = useUserStore();

  useEffect(() => {
    if (!userInfo) return;

    const couponCode = getCouponCode();
    if (!couponCode) return;

    redeemCoupon(couponCode)
      .then(removeCouponCode)
      .catch((err) => {
        if (err?.statusText === CouponErrEnum.invalid) {
          removeCouponCode();
        }
      });
  }, [userInfo]);
};

export default useCheckCoupon;
