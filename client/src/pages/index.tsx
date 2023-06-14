import React, { useEffect, useState } from 'react';
import { Card, Box, Link, Flex, Image, Button } from '@chakra-ui/react';
import Markdown from '@/components/Markdown';
import { useMarkdown } from '@/hooks/useMarkdown';
import { useRouter } from 'next/router';
import { useGlobalStore } from '@/store/global';

import styles from './index.module.scss';
import axios from 'axios';
import MyIcon from '@/components/Icon';

const Home = () => {
  const router = useRouter();
  const { inviterId } = router.query as { inviterId: string };
  const { data } = useMarkdown({ url: '/intro.md' });
  const {
    isPc,
    initData: { beianText }
  } = useGlobalStore();
  const [star, setStar] = useState(1500);

  useEffect(() => {
    if (inviterId) {
      localStorage.setItem('inviterId', inviterId);
    }
  }, [inviterId]);

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
          className={styles.textlg}
          fontWeight={'bold'}
          fontSize={['40px', '70px']}
          letterSpacing={'5px'}
        >
          AIHelper
        </Box>
        <Box className={styles.textlg} fontWeight={'bold'} fontSize={['30px', '50px']}>

        </Box>
        <Box className={styles.textlg} fontWeight={'bold'} fontSize={['30px', '50px']}>

        </Box>

        <Flex flexDirection={['column', 'row']} my={5}>
          <Button
            fontSize={['xl', '3xl']}
            h={'auto'}
            py={[2, 3]}
            onClick={() => router.push(`/model`)}
          >
            立即开始
          </Button>
        </Flex>
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

          <Box>Made by AIHelper Team.</Box>
        </Card>
      </Box>
    </Flex>
  );
};

export default Home;
