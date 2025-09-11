import { useEffect, useRef } from 'react';
import { getCouponCode, removeCouponCode } from '@/web/support/marketing/utils';
import type { UserType } from '@fastgpt/global/support/user/type.d';
import { redeemCoupon } from '@/web/support/user/team/api';

export const useCheckCoupon = (userInfo: UserType | null) => {
  const hasCheckedCouponRef = useRef(false);

  useEffect(() => {
    if (!userInfo || hasCheckedCouponRef.current) return;

    const couponCode = getCouponCode();
    if (!couponCode) return;

    hasCheckedCouponRef.current = true;

    redeemCoupon(couponCode)
      .catch(() => {})
      .finally(removeCouponCode);
  }, [userInfo]);
};

export default useCheckCoupon;
