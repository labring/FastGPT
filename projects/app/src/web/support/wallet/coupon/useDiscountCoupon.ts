import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getDiscountCouponList } from '@/web/support/wallet/bill/api';

type UseDiscountCouponProps = {
  teamId?: string;
};

/**
 * 获取团队折扣券列表
 */
export const useDiscountCoupon = (props?: UseDiscountCouponProps) => {
  const { teamId } = props || {};

  // 获取折扣券列表
  const {
    data: coupons = [],
    loading: isLoadingList,
    refresh
  } = useRequest2(
    async () => {
      if (!teamId) return [];
      return getDiscountCouponList(teamId);
    },
    {
      manual: !teamId,
      refreshDeps: [teamId]
    }
  );

  return {
    coupons,
    isLoadingList,
    refreshCouponList: refresh
  };
};
