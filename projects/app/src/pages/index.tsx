import React, { useEffect } from 'react';
import { Box } from '@chakra-ui/react';
import { feConfigs } from '@/web/common/system/staticData';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useRouter } from 'next/router';

import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Ability from './components/Ability';
import Choice from './components/Choice';
import Footer from './components/Footer';
import Loading from '@/components/Loading';

const Home = ({ homeUrl = '/' }: { homeUrl: string }) => {
  const router = useRouter();

  if (homeUrl !== '/') {
    router.replace(homeUrl);
  }

  useEffect(() => {
    router.prefetch('/app/list');
    router.prefetch('/login');
  }, [router]);

  return (
    <>
      <Box id="home" bg={'myWhite.600'} h={'100vh'} overflowY={'auto'} overflowX={'hidden'}>
        <Box position={'fixed'} zIndex={10} top={0} left={0} right={0}>
          <Navbar />
        </Box>
        <Box maxW={'1200px'} pt={'70px'} m={'auto'}>
          <Hero />
          <Ability />
          <Box my={[4, 6]}>
            <Choice />
          </Box>
        </Box>
        {feConfigs?.show_git && (
          <Box bg={'white'}>
            <Footer />
          </Box>
        )}
      </Box>
      {homeUrl !== '/' && <Loading bg={'white'} />}
    </>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content)),
      homeUrl: process.env.HOME_URL || '/'
    }
  };
}

export default Home;
