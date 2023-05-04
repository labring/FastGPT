import React, { useCallback, useEffect } from 'react';
import { Box, useColorMode, Flex } from '@chakra-ui/react';
import Navbar from './navbar';
import NavbarPhone from './navbarPhone';
import { useRouter } from 'next/router';
import { useScreen } from '@/hooks/useScreen';
import { useLoading } from '@/hooks/useLoading';
import Auth from './auth';
import { useGlobalStore } from '@/store/global';

const pcUnShowLayoutRoute: Record<string, boolean> = {
  '/login': true
};

const Layout = ({ children, isPcDevice }: { children: JSX.Element; isPcDevice: boolean }) => {
  const { isPc } = useScreen({ defaultIsPc: isPcDevice });
  const router = useRouter();
  const { colorMode, setColorMode } = useColorMode();
  const { Loading } = useLoading({ defaultLoading: true });
  const { loading } = useGlobalStore();

  useEffect(() => {
    if (colorMode === 'dark' && router.pathname !== '/chat') {
      setColorMode('light');
    }
  }, [colorMode, router.pathname, setColorMode]);

  const RenderPc = useCallback(
    () =>
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
      ),
    [children, router.pathname]
  );

  const RenderPhone = useCallback(() => {
    const phoneUnShowLayoutRoute: Record<string, boolean> = {
      '/login': true
    };

    const isChatPage =
      router.pathname === '/chat' && Object.values(router.query).join('').length !== 0;

    if (phoneUnShowLayoutRoute[router.pathname] || isChatPage) {
      return <Auth>{children}</Auth>;
    }
    return (
      <Flex h={'100%'} flexDirection={'column'}>
        <Box flex={'1 0 0'} h={0} overflow={'overlay'}>
          <Auth>{children}</Auth>
        </Box>
        <Box h={'50px'} borderTop={'1px solid rgba(0,0,0,0.1)'}>
          <NavbarPhone />
        </Box>
      </Flex>
    );
  }, [children, router]);

  return (
    <>
      <Box h={'100%'} overflow={'overlay'} bg={'gray.100'}>
        {isPc ? <RenderPc /> : <RenderPhone />}
      </Box>
      {loading && <Loading />}
    </>
  );
};

export default Layout;

Layout.getInitialProps = ({ req }: any) => {
  return {
    isPcDevice: !/Mobile/.test(req ? req.headers['user-agent'] : navigator.userAgent)
  };
};
