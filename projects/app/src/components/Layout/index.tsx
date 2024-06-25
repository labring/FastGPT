import React, { useEffect, useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { throttle } from 'lodash';
import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getUnreadCount } from '@/web/support/user/inform/api';
import dynamic from 'next/dynamic';

import Auth from './auth';
const Navbar = dynamic(() => import('./navbar'));
const NavbarPhone = dynamic(() => import('./navbarPhone'));
const UpdateInviteModal = dynamic(() => import('@/components/support/user/team/UpdateInviteModal'));
const NotSufficientModal = dynamic(() => import('@/components/support/wallet/NotSufficientModal'));
const SystemMsgModal = dynamic(() => import('@/components/support/user/inform/SystemMsgModal'));
const ImportantInform = dynamic(() => import('@/components/support/user/inform/ImportantInform'));

const pcUnShowLayoutRoute: Record<string, boolean> = {
  '/': true,
  '/login': true,
  '/login/provider': true,
  '/login/fastlogin': true,
  '/chat/share': true,
  '/chat/team': true,
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
  '/chat/share': true,
  '/chat/team': true,
  '/tools/price': true,
  '/price': true
};

const Layout = ({ children }: { children: JSX.Element }) => {
  const router = useRouter();
  const { Loading } = useLoading();
  const { loading, setScreenWidth, isPc, feConfigs, isNotSufficientModal } = useSystemStore();
  const { userInfo } = useUserStore();

  const isChatPage = useMemo(
    () => router.pathname === '/chat' && Object.values(router.query).join('').length !== 0,
    [router.pathname, router.query]
  );

  // listen screen width
  useEffect(() => {
    const resize = throttle(() => {
      setScreenWidth(document.documentElement.clientWidth);
    }, 300);

    window.addEventListener('resize', resize);

    resize();

    return () => {
      window.removeEventListener('resize', resize);
    };
  }, [setScreenWidth]);

  const { data, refetch: refetchUnRead } = useQuery(['getUnreadCount'], getUnreadCount, {
    enabled: !!userInfo && !!feConfigs.isPlus,
    refetchInterval: 10000
  });
  const unread = data?.unReadCount || 0;
  const importantInforms = data?.importantInforms || [];

  const isHideNavbar = !!pcUnShowLayoutRoute[router.pathname];

  return (
    <>
      <Box h={'100%'} bg={'myGray.100'}>
        {isPc === true && (
          <>
            {isHideNavbar ? (
              <Auth>{children}</Auth>
            ) : (
              <>
                <Box h={'100%'} position={'fixed'} left={0} top={0} w={'64px'}>
                  <Navbar unread={unread} />
                </Box>
                <Box h={'100%'} ml={'70px'} overflow={'overlay'}>
                  <Auth>{children}</Auth>
                </Box>
              </>
            )}
          </>
        )}
        {isPc === false && (
          <>
            {phoneUnShowLayoutRoute[router.pathname] || isChatPage ? (
              <Auth>{children}</Auth>
            ) : (
              <Flex h={'100%'} flexDirection={'column'}>
                <Box flex={'1 0 0'} h={0}>
                  <Auth>{children}</Auth>
                </Box>
                <Box h={'50px'} borderTop={'1px solid rgba(0,0,0,0.1)'}>
                  <NavbarPhone unread={unread} />
                </Box>
              </Flex>
            )}
          </>
        )}
      </Box>
      {feConfigs?.isPlus && (
        <>
          {!!userInfo && <UpdateInviteModal />}
          {isNotSufficientModal && <NotSufficientModal />}
          {!!userInfo && <SystemMsgModal />}
          {!!userInfo && importantInforms.length > 0 && (
            <ImportantInform informs={importantInforms} refetch={refetchUnRead} />
          )}
        </>
      )}

      <Loading loading={loading} zIndex={999999} />
    </>
  );
};

export default Layout;
