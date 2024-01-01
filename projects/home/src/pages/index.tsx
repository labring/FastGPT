import React, { useEffect } from 'react';
import { Box } from '@chakra-ui/react';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useRouter } from 'next/router';

import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Ability from './components/Ability';
import Choice from './components/Choice';
import Footer from './components/Footer';

const Home = () => {
  const router = useRouter();

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
        <Box bg={'white'}>
          <Footer />
        </Box>
      </Box>
    </>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content))
    }
  };
}

export default Home;
