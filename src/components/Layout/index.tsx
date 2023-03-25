import React, { useEffect } from 'react';
import { Box, useColorMode } from '@chakra-ui/react';
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
    icon: 'icon-gongzuotai-01',
    link: '/',
    activeLink: ['/']
  },
  {
    label: '模型',
    icon: 'icon-moxing',
    link: '/model/list',
    activeLink: ['/model/list', '/model/detail']
  },
  {
    label: '数据',
    icon: 'icon-datafull',
    link: '/data/list',
    activeLink: ['/data/list', '/data/detail']
  },
  {
    label: '账号',
    icon: 'icon-yonghu-yuan',
    link: '/number/setting',
    activeLink: ['/number/setting']
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
              <Box ml={'80px'} h={'100%'}>
                <Box maxW={'1100px'} m={'auto'} h={'100%'} p={7} overflowY={'auto'}>
                  <Auth>{children}</Auth>
                </Box>
              </Box>
            </>
          ) : (
            <Box pt={'60px'}>
              <Box
                h={'60px'}
                position={'fixed'}
                top={0}
                left={0}
                right={0}
                zIndex={100}
                borderBottom={'1px solid rgba(0,0,0,0.1)'}
              >
                <NavbarPhone navbarList={navbarList} />
              </Box>
              <Box py={3} px={4}>
                <Auth>{children}</Auth>
              </Box>
            </Box>
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
