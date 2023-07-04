import React from 'react';
import { Box, Grid, Card, useTheme, Flex, IconButton, Button } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useUserStore } from '@/store/user';
import { useQuery } from '@tanstack/react-query';
import Avatar from '@/components/Avatar';

import styles from './index.module.scss';
import MyIcon from '@/components/Icon';
import { AddIcon } from '@chakra-ui/icons';

const MyApps = () => {
  const theme = useTheme();
  const router = useRouter();
  const { myApps, loadMyModels } = useUserStore();

  /* 加载模型 */
  useQuery(['loadModels'], () => loadMyModels(false));

  return (
    <Box>
      <Flex py={3} px={5} borderBottom={theme.borders.base} alignItems={'center'}>
        <Box flex={1} className="textlg" letterSpacing={1} fontSize={'24px'} fontWeight={'bold'}>
          我的应用
        </Box>
        <Button leftIcon={<AddIcon />} variant={'base'}>
          新建
        </Button>
      </Flex>
      <Grid
        p={5}
        gridTemplateColumns={['1fr', 'repeat(3,1fr)', 'repeat(4,1fr)', 'repeat(5,1fr)']}
        gridGap={5}
      >
        {myApps.map((app) => (
          <Card
            key={app._id}
            py={4}
            px={5}
            cursor={'pointer'}
            h={'140px'}
            border={theme.borders.md}
            boxShadow={'none'}
            userSelect={'none'}
            _hover={{
              boxShadow: 'xl',
              transform: 'scale(1.03)',
              borderColor: 'transparent',
              '& .delete': {
                display: 'block'
              }
            }}
            onClick={() => router.push(`/app/detail?appId=${app._id}`)}
          >
            <Flex alignItems={'center'} h={'38px'} position={'relative'}>
              <Avatar src={app.avatar} borderRadius={'md'} w={'28px'} />
              <Box ml={3}>{app.name}</Box>
              <IconButton
                className="delete"
                position={'absolute'}
                right={0}
                size={'sm'}
                icon={<MyIcon name={'delete'} w={'14px'} />}
                variant={'base'}
                borderRadius={'md'}
                aria-label={'delete'}
                display={'none'}
                _hover={{
                  bg: 'myGray.100'
                }}
              />
            </Flex>
            <Box className={styles.intro} py={2} fontSize={'sm'} color={'myGray.600'}>
              {app.intro || '这个应用还没写介绍~'}
            </Box>
          </Card>
        ))}
      </Grid>
    </Box>
  );
};

export default MyApps;
