import React, { useEffect, useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getUnreadCount } from '@/web/support/user/inform/api';
import dynamic from 'next/dynamic';
import { useI18nLng } from '@fastgpt/web/hooks/useI18n';

import Auth from './auth';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useDebounceEffect, useMount } from 'ahooks';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useCheckCoupon } from './hooks/checkCoupon';
import HelperBot from './HelperBot';

const Navbar = dynamic(() => import('./navbar'));
const NavbarPhone = dynamic(() => import('./navbarPhone'));

const ResetExpiredPswModal = dynamic(
  () => import('@/components/support/user/safe/ResetExpiredPswModal'),
  { ssr: false }
);
const NotSufficientModal = dynamic(() => import('@/components/support/wallet/NotSufficientModal'), {
  ssr: false
});
const SystemMsgModal = dynamic(() => import('@/components/support/user/inform/SystemMsgModal'), {
  ssr: false
});
const ImportantInform = dynamic(() => import('@/components/support/user/inform/ImportantInform'), {
  ssr: false
});
const UpdateContact = dynamic(() => import('@/components/support/user/inform/UpdateContactModal'), {
  ssr: false
});
const ManualCopyModal = dynamic(
  () => import('@fastgpt/web/hooks/useCopyData').then((mod) => mod.ManualCopyModal),
  { ssr: false }
);
const ActivityAdModal = dynamic(() => import('@/components/support/activity/ActivityAdModal'), {
  ssr: false
});

const pcUnShowLayoutRoute: Record<string, boolean> = {
  '/': true,
  '/login': true,
  '/login/provider': true,
  '/login/fastlogin': true,
  '/chat/share': true,
  '/app/edit': true,
  '/chat': true,
  '/tools/price': true,
  '/price': true
};
const phoneUnShowLayoutRoute: Record<string, boolean> = {
  '/': true,
  '/login': true,
  '/login/provider': true,
  '/login/fastlogin': true,
  '/chat': true,
  '/chat/share': true,
  '/tools/price': true,
  '/price': true
};

export const navbarWidth = '64px';

const Layout = ({ children }: { children: JSX.Element }) => {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { Loading } = useLoading();
  const { setLastRoute, loading, feConfigs, llmModelList, embeddingModelList } = useSystemStore();
  const { isPc } = useSystem();
  const { userInfo, isUpdateNotification, setIsUpdateNotification } = useUserStore();
  const { setUserDefaultLng } = useI18nLng();

  // Auto redeem coupon
  useCheckCoupon();

  const isChatPage = useMemo(
    () => router.pathname === '/chat' && Object.values(router.query).join('').length !== 0,
    [router.pathname, router.query]
  );
  const isHideNavbar = !!pcUnShowLayoutRoute[router.pathname];

  // System hook
  const { data, refetch: refetchUnRead } = useQuery(['getUnreadCount'], getUnreadCount, {
    enabled: !!userInfo && !!feConfigs.isPlus,
    refetchInterval: 30000
  });
  const unread = data?.unReadCount || 0;
  const importantInforms = data?.importantInforms || [];

  const showUpdateNotification =
    isUpdateNotification &&
    feConfigs?.bind_notification_method &&
    feConfigs?.bind_notification_method.length > 0 &&
    !userInfo?.contact &&
    !!userInfo?.team.permission.isOwner;

  useMount(() => {
    setUserDefaultLng();
  });

  // Check model invalid
  useDebounceEffect(
    () => {
      if (userInfo?.username === 'root') {
        if (llmModelList.length === 0) {
          toast({
            status: 'warning',
            title: t('common:llm_model_not_config')
          });
          router.pathname !== '/account/model' && router.push('/account/model');
        } else if (embeddingModelList.length === 0) {
          toast({
            status: 'warning',
            title: t('common:embedding_model_not_config')
          });
          router.pathname !== '/account/model' && router.push('/account/model');
        }
      }
    },
    [embeddingModelList.length, llmModelList.length, userInfo?.username],
    {
      wait: 2000
    }
  );

  // Route watch
  useEffect(() => {
    setLastRoute(router.pathname);
  }, [router.pathname]);

  return (
    <>
      <Box h={'100%'} bg={'myGray.100'}>
        {isPc === true && (
          <>
            {isHideNavbar ? (
              <Auth>{children}</Auth>
            ) : (
              <Auth>
                <Box h={'100%'} position={'fixed'} left={0} top={0} w={navbarWidth}>
                  <Navbar unread={unread} />
                </Box>
                <Box h={'100%'} ml={navbarWidth} overflow={'overlay'}>
                  {children}
                </Box>
              </Auth>
            )}
          </>
        )}
        {isPc === false && (
          <>
            {phoneUnShowLayoutRoute[router.pathname] || isChatPage ? (
              <Auth>{children}</Auth>
            ) : (
              <Auth>
                <Flex h={'100%'} flexDirection={'column'}>
                  <Box flex={'1 0 0'} h={0}>
                    {children}
                  </Box>
                  <Box h={'50px'} borderTop={'1px solid rgba(0,0,0,0.1)'}>
                    <NavbarPhone unread={unread} />
                  </Box>
                </Flex>
              </Auth>
            )}
          </>
        )}
      </Box>
      {feConfigs?.isPlus && (
        <>
          <NotSufficientModal />
          <SystemMsgModal />
          {showUpdateNotification && (
            <UpdateContact onClose={() => setIsUpdateNotification(false)} mode="contact" />
          )}
          {!!userInfo && importantInforms.length > 0 && (
            <ImportantInform informs={importantInforms} refetch={refetchUnRead} />
          )}
          <ResetExpiredPswModal />
          <HelperBot />
        </>
      )}

      <ManualCopyModal />
      <ActivityAdModal />
      <Loading loading={loading} zIndex={999999} />
    </>
  );
};

export default Layout;
