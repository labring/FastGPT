import { Box, Flex, Button, Image } from '@chakra-ui/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { feConfigs } from '@/store/static';
import { useGlobalStore } from '@/store/global';
import MyIcon from '@/components/Icon';
import { useRouter } from 'next/router';

const Hero = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { isPc, gitStar } = useGlobalStore();
  const [showVideo, setShowVide] = useState(false);

  return (
    <Flex flexDirection={'column'} pt={['24px', '50px']} alignItems={'center'} userSelect={'none'}>
      <Box fontSize={['38px', '60px']} fontWeight={'bold'}>
        {t('home.slogan')}
      </Box>
      <Box fontSize={['xl', '3xl']} py={5} color={'myGray.600'} textAlign={'center'} maxW={'400px'}>
        {t('home.desc')}
      </Box>
      <Flex zIndex={1} flexDirection={['column', 'row']} mt={[5, 8]}>
        {feConfigs?.show_git && (
          <Button
            mr={[0, 5]}
            mb={[5, 0]}
            fontSize={['xl', '3xl']}
            h={'auto'}
            py={[2, 3]}
            variant={'base'}
            border={'2px solid'}
            borderColor={'myGray.800'}
            transition={'0.3s'}
            borderRadius={'xl'}
            _hover={{
              bg: 'myGray.800',
              color: 'white'
            }}
            leftIcon={<MyIcon name={'git'} w={'20px'} />}
            onClick={() => window.open('https://github.com/labring/FastGPT', '_blank')}
          >
            Stars {(gitStar / 1000).toFixed(1)}k
          </Button>
        )}
        <Button
          fontSize={['xl', '3xl']}
          h={['38px', 'auto']}
          borderRadius={'xl'}
          py={[2, 3]}
          w={'150px'}
          onClick={() => router.push(`/app/list`)}
        >
          {t('home.Start Now')}
        </Button>
      </Flex>
      <Box mt={['', '-50px']} position={'relative'}>
        <Image
          minH={['auto', '400px']}
          src={isPc ? '/imgs/home/videobgpc.png' : '/imgs/home/videobgphone.png'}
          mx={['-10%', 'auto']}
          maxW={['120%', '1000px']}
          alt=""
          draggable={false}
          loading={'lazy'}
        />
        <MyIcon
          name={'playFill'}
          position={'absolute'}
          w={['30px', '40px']}
          cursor={'pointer'}
          left={'50%'}
          top={'50%'}
          color={'#363c42b8'}
          transform={['translate(-50%,5px)', 'translate(-50%,40px)']}
          onClick={() => setShowVide(true)}
        />
      </Box>
      {showVideo && (
        <Flex
          position={'fixed'}
          zIndex={99}
          top={0}
          left={0}
          right={0}
          bottom={0}
          alignItems={'center'}
          justifyContent={'center'}
          bg={'rgba(255,255,255,0.4)'}
          onClick={() => setShowVide(false)}
        >
          <Box
            w={['100vw', '50%']}
            borderRadius={'lg'}
            overflow={'hidden'}
            onClick={(e) => e.preventDefault()}
          >
            <video
              style={{
                margin: 'auto'
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
              src={'https://otnvvf-imgs.oss.laf.run/fastgpt.mp4'}
              controls
              autoPlay
            />
          </Box>
        </Flex>
      )}
    </Flex>
  );
};

export default Hero;
