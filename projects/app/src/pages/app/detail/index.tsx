import React, { useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Box, Flex, IconButton, useTheme } from '@chakra-ui/react';
import { useUserStore } from '@/store/user';
import dynamic from 'next/dynamic';
import { defaultApp } from '@/constants/model';
import { useToast } from '@/hooks/useToast';
import { useQuery } from '@tanstack/react-query';

import Tabs from '@/components/Tabs';
import SideTabs from '@/components/SideTabs';
import Avatar from '@/components/Avatar';
import MyIcon from '@/components/Icon';
import PageContainer from '@/components/PageContainer';
import Loading from '@/components/Loading';
import BasicEdit from './components/BasicEdit';
import { serviceSideProps } from '@/utils/web/i18n';

const AdEdit = dynamic(() => import('./components/AdEdit'), {
  loading: () => <Loading />
});
const OutLink = dynamic(() => import('./components/OutLink'), {});
const Logs = dynamic(() => import('./components/Logs'), {});

enum TabEnum {
  'basicEdit' = 'basicEdit',
  'adEdit' = 'adEdit',
  'outLink' = 'outLink',
  'logs' = 'logs',
  'startChat' = 'startChat'
}

const AppDetail = ({ currentTab }: { currentTab: `${TabEnum}` }) => {
  const router = useRouter();
  const theme = useTheme();
  const { toast } = useToast();
  const { appId } = router.query as { appId: string };
  const { appDetail = defaultApp, loadAppDetail, clearAppModules } = useUserStore();

  const setCurrentTab = useCallback(
    (tab: `${TabEnum}`) => {
      router.replace({
        query: {
          appId,
          currentTab: tab
        }
      });
    },
    [appId, router]
  );

  const tabList = useMemo(
    () => [
      { label: '简易配置', id: TabEnum.basicEdit, icon: 'overviewLight' },
      { label: '高级编排', id: TabEnum.adEdit, icon: 'settingLight' },
      { label: '外部使用', id: TabEnum.outLink, icon: 'shareLight' },
      { label: '对话日志', id: TabEnum.logs, icon: 'logsLight' },
      { label: '立即对话', id: TabEnum.startChat, icon: 'chat' }
    ],
    []
  );

  useEffect(() => {
    const listen =
      process.env.NODE_ENV === 'production'
        ? (e: any) => {
            e.preventDefault();
            e.returnValue = '内容已修改，确认离开页面吗？';
          }
        : () => {};
    window.addEventListener('beforeunload', listen);

    return () => {
      window.removeEventListener('beforeunload', listen);
      clearAppModules();
    };
  }, []);

  useQuery([appId], () => loadAppDetail(appId, true), {
    onError(err: any) {
      toast({
        title: err?.message || '获取应用异常',
        status: 'error'
      });
      router.replace('/app/list');
    },
    onSettled() {
      router.prefetch(`/chat?appId=${appId}`);
    }
  });

  return (
    <PageContainer>
      <Flex flexDirection={['column', 'row']} h={'100%'}>
        {/* pc tab */}
        <Box
          display={['none', 'flex']}
          flexDirection={'column'}
          p={4}
          w={'200px'}
          borderRight={theme.borders.base}
        >
          <Flex mb={4} alignItems={'center'}>
            <Avatar src={appDetail.avatar} w={'34px'} borderRadius={'lg'} />
            <Box ml={2} fontWeight={'bold'}>
              {appDetail.name}
            </Box>
          </Flex>
          <SideTabs
            flex={1}
            mx={'auto'}
            mt={2}
            w={'100%'}
            list={tabList}
            activeId={currentTab}
            onChange={(e: any) => {
              if (e === 'startChat') {
                router.push(`/chat?appId=${appId}`);
              } else {
                setCurrentTab(e);
              }
            }}
          />
          <Flex
            alignItems={'center'}
            cursor={'pointer'}
            py={2}
            px={3}
            borderRadius={'md'}
            _hover={{ bg: 'myGray.100' }}
            onClick={() => router.replace('/app/list')}
          >
            <IconButton
              mr={3}
              icon={<MyIcon name={'backFill'} w={'18px'} color={'myBlue.600'} />}
              bg={'white'}
              boxShadow={'1px 1px 9px rgba(0,0,0,0.15)'}
              h={'28px'}
              size={'sm'}
              borderRadius={'50%'}
              aria-label={''}
            />
            我的应用
          </Flex>
        </Box>
        {/* phone tab */}
        <Box display={['block', 'none']} textAlign={'center'} py={3}>
          <Box className="textlg" fontSize={'xl'} fontWeight={'bold'}>
            {appDetail.name}
          </Box>
          <Tabs
            mx={'auto'}
            mt={2}
            w={'100%'}
            list={tabList}
            size={'sm'}
            activeId={currentTab}
            onChange={(e: any) => {
              if (e === 'startChat') {
                router.push(`/chat?appId=${appId}`);
              } else {
                setCurrentTab(e);
              }
            }}
          />
        </Box>
        <Box flex={'1 0 0'} h={[0, '100%']} overflow={['overlay', '']}>
          {currentTab === TabEnum.basicEdit && <BasicEdit appId={appId} />}
          {currentTab === TabEnum.adEdit && appDetail && (
            <AdEdit app={appDetail} onCloseSettings={() => setCurrentTab(TabEnum.basicEdit)} />
          )}
          {currentTab === TabEnum.logs && <Logs appId={appId} />}
          {currentTab === TabEnum.outLink && <OutLink appId={appId} />}
        </Box>
      </Flex>
    </PageContainer>
  );
};

export async function getServerSideProps(context: any) {
  const currentTab = context?.query?.currentTab || TabEnum.basicEdit;

  return {
    props: { currentTab, ...(await serviceSideProps(context)) }
  };
}

export default AppDetail;
