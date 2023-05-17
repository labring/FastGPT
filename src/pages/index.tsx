import React, { useEffect } from 'react';
import { Card, Box, Link, Flex, Image, Button } from '@chakra-ui/react';
import Markdown from '@/components/Markdown';
import { useMarkdown } from '@/hooks/useMarkdown';
import { getFilling } from '@/api/system';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import { useGlobalStore } from '@/store/global';

import styles from './index.module.scss';

const Home = () => {
  const router = useRouter();
  const { inviterId } = router.query as { inviterId: string };
  const { data } = useMarkdown({ url: '/intro.md' });
  const { isPc } = useGlobalStore();

  useEffect(() => {
    if (inviterId) {
      localStorage.setItem('inviterId', inviterId);
    }
  }, [inviterId]);

  const { data: { beianText = '' } = {} } = useQuery(['init'], getFilling);

  /* 加载动画 */
  useEffect(() => {
    setTimeout(() => {
      window.particlesJS?.('particles-js', {
        particles: {
          number: {
            value: 40,
            density: {
              enable: true,
              value_area: 500
            }
          },
          color: {
            value: '#4e83fd'
          },
          shape: {
            type: 'circle',
            stroke: {
              width: 0,
              color: '#000000'
            },
            polygon: {
              nb_sides: 5
            }
          },
          opacity: {
            value: 0.5,
            random: false,
            anim: {
              enable: false,
              speed: 0.1,
              opacity_min: 0.1,
              sync: false
            }
          },
          size: {
            value: 3,
            random: true,
            anim: {
              enable: false,
              speed: 10,
              size_min: 0.1,
              sync: false
            }
          },
          line_linked: {
            enable: true,
            distance: 150,
            color: '#adceff',
            opacity: 0.4,
            width: 1
          },
          move: {
            enable: true,
            speed: 2,
            direction: 'none',
            random: true,
            straight: false,
            out_mode: 'out',
            bounce: false,
            attract: {
              enable: false,
              rotateX: 600,
              rotateY: 1200
            }
          }
        },
        interactivity: {
          detect_on: 'canvas',
          events: {
            onhover: {
              enable: true,
              mode: 'grab'
            },
            onclick: {
              enable: true,
              mode: 'push'
            },
            resize: true
          },
          modes: {
            grab: {
              distance: 140,
              line_linked: {
                opacity: 1
              }
            },
            bubble: {
              distance: 400,
              size: 40,
              duration: 2,
              opacity: 8,
              speed: 3
            },
            repulse: {
              distance: 200,
              duration: 0.4
            },
            push: {
              particles_nb: 4
            },
            remove: {
              particles_nb: 2
            }
          }
        },
        retina_detect: true
      });
    }, 1000);
  }, [isPc]);

  return (
    <Flex
      className={styles.home}
      position={'relative'}
      flexDirection={'column'}
      alignItems={'center'}
      h={'100%'}
      overflow={'overlay'}
    >
      <Box id={'particles-js'} position={'absolute'} top={0} left={0} right={0} bottom={0} />

      <Flex
        flexDirection={'column'}
        alignItems={'center'}
        mt={'22vh'}
        position={'absolute'}
        userSelect={'none'}
      >
        <Image src="/icon/logo.png" w={['70px', '120px']} h={['70px', '120px']} alt={''}></Image>
        <Box
          fontWeight={'bold'}
          fontSize={['40px', '70px']}
          letterSpacing={'5px'}
          color={'myBlue.600'}
        >
          FastGpt
        </Box>
        <Box color={'myBlue.600'} fontSize={['30px', '50px']}>
          三分钟
        </Box>
        <Box color={'myBlue.600'} fontSize={['30px', '50px']}>
          搭建 AI 知识库
        </Box>

        <Button
          my={5}
          fontSize={['xl', '3xl']}
          h={'auto'}
          py={[2, 3]}
          onClick={() => router.push(`/model`)}
        >
          点击开始
        </Button>
      </Flex>

      <Box w={'100%'} mt={'100vh'} px={[5, 10]} pb={[5, 10]}>
        <Card p={5} lineHeight={2}>
          <Markdown source={data} isChatting={false} />
        </Card>

        <Card p={5} mt={4} textAlign={'center'}>
          {beianText && (
            <Link href="https://beian.miit.gov.cn/" target="_blank">
              {beianText}
            </Link>
          )}

          <Box>Made by FastGpt Team.</Box>
        </Card>
      </Box>
    </Flex>
  );
};

export default Home;
