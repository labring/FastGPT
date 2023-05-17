import React, { useEffect, useMemo } from 'react';
import { Box, useColorMode, Flex } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useLoading } from '@/hooks/useLoading';
import { useGlobalStore } from '@/store/global';
import { throttle } from 'lodash';
import Auth from './auth';
import Navbar from './navbar';
import NavbarPhone from './navbarPhone';

const pcUnShowLayoutRoute: Record<string, boolean> = {
  '/': true,
  '/login': true,
  '/chat/share': true
};
const phoneUnShowLayoutRoute: Record<string, boolean> = {
  '/': true,
  '/login': true,
  '/chat/share': true
};

const Layout = ({ children }: { children: JSX.Element }) => {
  const router = useRouter();
  const { colorMode, setColorMode } = useColorMode();
  const { Loading } = useLoading();
  const { loading, setScreenWidth, isPc } = useGlobalStore();

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
    resize();

    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
    };
  }, [setScreenWidth]);

  return (
    <>
      <Box
        h={'100%'}
        bgGradient={'linear(to-t,rgba(173, 206, 255, 0.05) 0%, rgba(173, 206, 255, 0.12) 100%)'}
      >
        {isPc ? (
          pcUnShowLayoutRoute[router.pathname] ? (
            <Auth>{children}</Auth>
          ) : (
            <>
              <Box h={'100%'} position={'fixed'} left={0} top={0} w={'60px'}>
                <Navbar />
              </Box>
              <Box h={'100%'} ml={'60px'} overflow={'overlay'}>
                <Auth>{children}</Auth>
              </Box>
            </>
          )
        ) : phoneUnShowLayoutRoute[router.pathname] || isChatPage ? (
          <Auth>{children}</Auth>
        ) : (
          <Flex h={'100%'} flexDirection={'column'}>
            <Box flex={'1 0 0'} h={0} overflow={'overlay'}>
              <Auth>{children}</Auth>
            </Box>
            <Box h={'50px'} borderTop={'1px solid rgba(0,0,0,0.1)'}>
              <NavbarPhone />
            </Box>
          </Flex>
        )}
      </Box>
      <Loading loading={loading} />
    </>
  );
};

export default Layout;
