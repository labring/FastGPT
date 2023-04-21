import React, { useEffect } from 'react';
import { Box, useColorMode, Flex } from '@chakra-ui/react';
import Navbar from './navbar';
import NavbarPhone from './navbarPhone';
import { useRouter } from 'next/router';
import { useScreen } from '@/hooks/useScreen';
import { useLoading } from '@/hooks/useLoading';
import Auth from './auth';
import { useGlobalStore } from '@/store/global';

const unShowLayoutRoute: { [key: string]: boolean } = {
  '/login': true,
  '/chat': true
};

const navbarList = [
  {
    label: '介绍',
    icon: 'board',
    link: '/',
    activeLink: ['/']
  },
  {
    label: '模型',
    icon: 'model',
    link: '/model/list',
    activeLink: ['/model/list', '/model/detail']
  },
  {
    label: '账号',
    icon: 'user',
    link: '/number/setting',
    activeLink: ['/number/setting']
  },
  {
    label: '邀请',
    icon: 'promotion',
    link: '/promotion',
    activeLink: ['/promotion']
  },
  {
    label: '开发',
    icon: 'develop',
    link: '/openapi',
    activeLink: ['/openapi']
  }
];

const Layout = ({ children }: { children: JSX.Element }) => {
  const { isPc } = useScreen();
  const router = useRouter();
  const { colorMode, setColorMode } = useColorMode();
  const { Loading } = useLoading({ defaultLoading: true });
  const { loading } = useGlobalStore();

  useEffect(() => {
    if (colorMode === 'dark' && router.pathname !== '/chat') {
      setColorMode('light');
    }
  }, [colorMode, router.pathname, setColorMode]);

  return (
    <>
      {!unShowLayoutRoute[router.pathname] ? (
        <Box h={'100%'} backgroundColor={'gray.100'} overflow={'auto'}>
          {isPc ? (
            <>
              <Box h={'100%'} position={'fixed'} left={0} top={0} w={'80px'}>
                <Navbar navbarList={navbarList} />
              </Box>
              <Box h={'100%'} ml={'80px'}>
                <Box h={'100%'} py={7} px={'5vw'} m={'auto'} overflowY={'auto'}>
                  <Auth>{children}</Auth>
                </Box>
              </Box>
            </>
          ) : (
            <Flex h={'100%'} flexDirection={'column'}>
              <Box h={'60px'} borderBottom={'1px solid rgba(0,0,0,0.1)'}>
                <NavbarPhone navbarList={navbarList} />
              </Box>
              <Box flex={'1 0 0'} h={0} py={3} px={4} overflowY={'auto'}>
                <Auth>{children}</Auth>
              </Box>
            </Flex>
          )}
        </Box>
      ) : (
        <Auth>
          <>{children}</>
        </Auth>
      )}
      {loading && <Loading />}
    </>
  );
};

export default Layout;
