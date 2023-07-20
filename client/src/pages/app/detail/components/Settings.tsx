import React, { useCallback, useState } from 'react';
import { Box, Flex, Button, Grid, useTheme, IconButton } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import { useUserStore } from '@/store/user';
import { useToast } from '@/hooks/useToast';
import { useLoading } from '@/hooks/useLoading';
import { delModelById } from '@/api/app';
import { useConfirm } from '@/hooks/useConfirm';
import dynamic from 'next/dynamic';
import { AppSchema } from '@/types/mongoSchema';

import Avatar from '@/components/Avatar';
import MyIcon from '@/components/Icon';
import TotalUsage from './Charts/TotalUsage';

const InfoModal = dynamic(() => import('./InfoModal'));
import AppEdit from './edit';
import styles from '../../list/index.module.scss';

const Settings = ({ appId }: { appId: string }) => {
  const theme = useTheme();
  const { toast } = useToast();
  const router = useRouter();
  const { Loading, setIsLoading } = useLoading();
  const { appDetail, loadAppDetail } = useUserStore();
  const { openConfirm, ConfirmChild } = useConfirm({
    content: '确认删除该应用?'
  });
  const [settingAppInfo, setSettingAppInfo] = useState<AppSchema>();
  const [fullScreen, setFullScreen] = useState(false);

  /* 点击删除 */
  const handleDelModel = useCallback(async () => {
    if (!appDetail) return;
    setIsLoading(true);
    try {
      await delModelById(appDetail._id);
      toast({
        title: '删除成功',
        status: 'success'
      });
      router.replace(`/app/list`);
    } catch (err: any) {
      toast({
        title: err?.message || '删除失败',
        status: 'error'
      });
    }
    setIsLoading(false);
  }, [appDetail, setIsLoading, toast, router]);

  // load app data
  const { refetch } = useQuery([appId], () => loadAppDetail(appId, true), {
    enabled: false
  });

  return (
    <Flex h={'100%'} flexDirection={'column'} position={'relative'}>
      <Box w={'100%'} pt={[0, 7]} px={[3, 5, 8]}>
        <Grid gridTemplateColumns={['1fr', 'repeat(2,1fr)']} gridGap={[2, 4, 6]}>
          <Box>
            <Box mb={2} fontSize={['md', 'xl']}>
              概览
            </Box>
            <Box
              border={theme.borders.base}
              borderRadius={'lg'}
              px={5}
              py={4}
              bg={'myBlue.100'}
              position={'relative'}
            >
              <Flex alignItems={'center'} py={2}>
                <Avatar src={appDetail.avatar} borderRadius={'md'} w={'28px'} />
                <Box ml={3} fontWeight={'bold'} fontSize={'lg'}>
                  {appDetail.name}
                </Box>
                <IconButton
                  className="delete"
                  position={'absolute'}
                  top={4}
                  right={4}
                  size={'sm'}
                  icon={<MyIcon name={'delete'} w={'14px'} />}
                  variant={'base'}
                  borderRadius={'md'}
                  aria-label={'delete'}
                  _hover={{
                    bg: 'myGray.100',
                    color: 'red.600'
                  }}
                  onClick={openConfirm(handleDelModel)}
                />
              </Flex>
              <Box className={styles.intro} py={3} wordBreak={'break-all'} color={'myGray.600'}>
                {appDetail.intro || '快来给应用一个介绍~'}
              </Box>
              <Flex>
                <Button
                  size={['sm', 'md']}
                  variant={'base'}
                  leftIcon={<MyIcon name={'chatLight'} w={'16px'} />}
                  onClick={() => router.push(`/chat?appId=${appId}`)}
                >
                  对话
                </Button>
                <Button
                  mx={3}
                  size={['sm', 'md']}
                  variant={'base'}
                  leftIcon={<MyIcon name={'shareLight'} w={'16px'} />}
                  onClick={() => {
                    router.replace({
                      query: {
                        appId,
                        currentTab: 'share'
                      }
                    });
                  }}
                >
                  分享
                </Button>
                <Button
                  size={['sm', 'md']}
                  variant={'base'}
                  leftIcon={<MyIcon name={'settingLight'} w={'16px'} />}
                  onClick={() => setSettingAppInfo(appDetail)}
                >
                  设置
                </Button>
              </Flex>
            </Box>
          </Box>
          <Flex flexDirection={'column'}>
            <Box mb={2} fontSize={['md', 'xl']}>
              近 14 日消费
            </Box>
            <TotalUsage appId={appId} />
          </Flex>
        </Grid>
      </Box>
      <Box flex={'1 0 0'} position={'relative'}>
        <AppEdit
          app={appDetail}
          onFullScreen={(val) => setFullScreen(val)}
          fullScreen={fullScreen}
        />
      </Box>

      {settingAppInfo && (
        <InfoModal
          defaultApp={settingAppInfo}
          onClose={() => setSettingAppInfo(undefined)}
          onSuccess={refetch}
        />
      )}

      <ConfirmChild />
      <Loading fixed={false} />
    </Flex>
  );
};

export default Settings;
