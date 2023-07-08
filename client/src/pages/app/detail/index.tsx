import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { Box, Flex, useTheme } from '@chakra-ui/react';
import { useUserStore } from '@/store/user';
import dynamic from 'next/dynamic';

import Tabs from '@/components/Tabs';
import SlideTabs from '@/components/SlideTabs';
import Settings from './components/Settings';
import { defaultApp } from '@/constants/model';
import Avatar from '@/components/Avatar';
import PageContainer from '@/components/PageContainer';

const EditApp = dynamic(() => import('./components/edit'), {
  ssr: false
});
const Share = dynamic(() => import('./components/Share'), {
  ssr: false
});
const API = dynamic(() => import('./components/API'), {
  ssr: false
});

enum TabEnum {
  'settings' = 'settings',
  'edit' = 'edit',
  'share' = 'share',
  'API' = 'API'
}

const AppDetail = ({ currentTab }: { currentTab: `${TabEnum}` }) => {
  const router = useRouter();
  const theme = useTheme();
  const { appId } = router.query as { appId: string };
  const { appDetail = defaultApp, loadAppDetail, userInfo } = useUserStore();

  const isOwner = useMemo(
    () => appDetail.userId === userInfo?._id,
    [appDetail.userId, userInfo?._id]
  );

  const setCurrentTab = useCallback(
    (tab: `${TabEnum}`) => {
      router.replace({
        pathname: router.pathname,
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
      { label: '基础信息', id: TabEnum.settings, icon: 'text' },
      ...(isOwner ? [{ label: '编排', id: TabEnum.edit, icon: 'edit' }] : []),
      { label: '分享', id: TabEnum.share, icon: 'edit' },
      { label: 'API', id: TabEnum.API, icon: 'edit' },
      { label: '立即对话', id: 'startChat', icon: 'chat' }
    ],
    [isOwner]
  );

  useEffect(() => {
    window.onbeforeunload = (e) => {
      e.preventDefault();
      e.returnValue = '内容已修改，确认离开页面吗？';
    };

    return () => {
      window.onbeforeunload = null;
    };
  }, []);

  useEffect(() => {
    loadAppDetail(appId);
  }, [appId, loadAppDetail]);

  return (
    <PageContainer>
      <Box display={['block', 'flex']} h={'100%'}>
        {/* pc tab */}
        <Box display={['none', 'block']} p={4} w={'200px'} borderRight={theme.borders.base}>
          <Flex mb={4} alignItems={'center'}>
            <Avatar src={appDetail.avatar} w={'34px'} borderRadius={'lg'} />
            <Box ml={2} fontWeight={'bold'}>
              {appDetail.name}
            </Box>
          </Flex>
          <SlideTabs
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
        </Box>
        {/* phone tab */}
        <Box display={['block', 'none']} textAlign={'center'} px={5} py={3}>
          <Box className="textlg" fontSize={'3xl'} fontWeight={'bold'}>
            {appDetail.name}
          </Box>
          <Tabs
            mx={'auto'}
            mt={2}
            w={'300px'}
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
        <Box flex={1}>
          {currentTab === TabEnum.settings && <Settings modelId={appId} />}
          {currentTab === TabEnum.edit && (
            <Box position={'fixed'} zIndex={999} top={0} left={0} right={0} bottom={0}>
              <EditApp app={appDetail} onBack={() => setCurrentTab(TabEnum.settings)} />
            </Box>
          )}
          {currentTab === TabEnum.API && <API modelId={appId} />}
          {currentTab === TabEnum.share && <Share modelId={appId} />}
        </Box>
      </Box>
    </PageContainer>
  );
};

export async function getServerSideProps(context: any) {
  const currentTab = context?.query?.currentTab || TabEnum.settings;

  return {
    props: { currentTab }
  };
}

export default AppDetail;
