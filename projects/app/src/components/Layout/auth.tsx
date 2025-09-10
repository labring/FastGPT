import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { setCode, getCode, removeCode } from '@/web/support/marketing/utils';
import { useEffect, useRef } from 'react';
import { redeemCoupon } from '@/web/support/user/team/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

const unAuthPage: { [key: string]: boolean } = {
  '/': true,
  '/login': true,
  '/login/provider': true,
  '/login/fastlogin': true,
  '/login/sso': true,
  '/appStore': true,
  '/chat': true,
  '/chat/share': true,
  '/tools/price': true,
  '/price': true
};

const Auth = ({ children }: { children: JSX.Element | React.ReactNode }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { userInfo, initUserInfo } = useUserStore();

  const { runAsync: redeemCouponAsync } = useRequest2(redeemCoupon, {
    manual: true,
    onSuccess: () => {
      removeCode();
    },
    successToast: t('common:Success')
  });

  useEffect(() => {
    const { couponCode } = router.query;
    if (couponCode && typeof couponCode === 'string') {
      const previousCode = getCode();
      if (previousCode !== couponCode) {
        setCode(couponCode);
      }
    }
  }, []);

  const hasLogined = useRef(false);
  useEffect(() => {
    if (!userInfo) return;
    if (hasLogined.current) return;
    hasLogined.current = true;

    const couponCode = getCode();
    if (couponCode) {
      redeemCouponAsync(couponCode);
    }
  }, [userInfo]);

  useQuery(
    [router.pathname],
    () => {
      if (unAuthPage[router.pathname] === true || userInfo) {
        return null;
      } else {
        return initUserInfo();
      }
    },
    {
      onError(error) {
        console.log('error->', error);
        router.replace(
          `/login?lastRoute=${encodeURIComponent(location.pathname + location.search)}`
        );
        toast({
          status: 'warning',
          title: t('common:support.user.Need to login')
        });
      }
    }
  );

  return !!userInfo || unAuthPage[router.pathname] === true ? children : null;
};

export default Auth;
