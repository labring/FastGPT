import React, { useEffect, useMemo } from 'react';
import { Box, useColorMode, Flex } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useLoading } from '@/hooks/useLoading';
import { useGlobalStore } from '@/store/global';
import { throttle } from 'lodash';
import Auth from './auth';
import Navbar from './navbar';
import NavbarPhone from './navbarPhone';
import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '@/store/user';
import { getUnreadCount } from '@/api/user';

const pcUnShowLayoutRoute: Record<string, boolean> = {
  '/': true,
  '/login': true,
  '/login/provider': true,
  '/chat/share': true,
  '/app/edit': true,
  '/chat': true
};
const phoneUnShowLayoutRoute: Record<string, boolean> = {
  '/': true,
  '/login': true,
  '/login/provider': true,
  '/chat/share': true
};

const Layout = ({ children }: { children: JSX.Element }) => {
  const router = useRouter();
  const { colorMode, setColorMode } = useColorMode();
  const { Loading } = useLoading();
  const { loading, setScreenWidth, isPc, loadGitStar } = useGlobalStore();
  const { userInfo } = useUserStore();

  const isChatPage = useMemo(
    () => router.pathname === '/chat' && Object.values(router.query).join('').length !== 0,
    [router.pathname, router.query]
  );

  useEffect(() => {
    if (colorMode === 'dark' && router.pathname !== '/chat') {
      setColorMode('light');
    }
  }, [colorMode, router.pathname, setColorMode]);

  useEffect(() => {
    const resize = throttle(() => {
      setScreenWidth(document.documentElement.clientWidth);
    }, 300);

    window.addEventListener('resize', resize);

    resize();
    loadGitStar();

    return () => {
      window.removeEventListener('resize', resize);
    };
  }, [loadGitStar, setScreenWidth]);

  const { data: unread = 0 } = useQuery(['getUnreadCount'], getUnreadCount, {
    enabled: !!userInfo,
    refetchInterval: 10000
  });

  return (
    <>
      <Box h={'100%'} bg={'myWhite.600'}>
        {isPc === true && (
          <>
            {pcUnShowLayoutRoute[router.pathname] ? (
              <Auth>{children}</Auth>
            ) : (
              <>
                <Box h={'100%'} position={'fixed'} left={0} top={0} w={'70px'}>
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
            <Box h={'100%'} display={['block', 'none']}>
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
            </Box>
          </>
        )}
      </Box>
      <Loading loading={loading} />
    </>
  );
};

export default Layout;
