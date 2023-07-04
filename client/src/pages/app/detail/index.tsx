import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Box, Flex } from '@chakra-ui/react';
import { useUserStore } from '@/store/user';
import { useGlobalStore } from '@/store/global';
import dynamic from 'next/dynamic';

import Tabs from '@/components/Tabs';
import Settings from './components/Settings';
import { defaultApp } from '@/constants/model';

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
  const { appId } = router.query as { appId: string };
  const { isPc } = useGlobalStore();
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
    <Flex
      flexDirection={'column'}
      h={'100%'}
      maxW={'100vw'}
      pt={4}
      overflow={'overlay'}
      position={'relative'}
      bg={'white'}
    >
      {/* 头部 */}
      <Box textAlign={['center', 'left']} px={5} mb={4}>
        <Box className="textlg" display={['block', 'none']} fontSize={'3xl'} fontWeight={'bold'}>
          {appDetail.name}
        </Box>
        <Tabs
          mx={['auto', '0']}
          mt={2}
          w={['300px', '360px']}
          list={[
            { label: '配置', id: TabEnum.settings },
            ...(isOwner ? [{ label: '编排', id: TabEnum.edit }] : []),
            { label: '分享', id: TabEnum.share },
            { label: 'API', id: TabEnum.API },
            { label: '立即对话', id: 'startChat' }
          ]}
          size={isPc ? 'md' : 'sm'}
          activeId={currentTab}
          onChange={(e: any) => {
            if (e === 'startChat') {
              router.push(`/chat?modelId=${appId}`);
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
    </Flex>
  );
};

export async function getServerSideProps(context: any) {
  const currentTab = context?.query?.currentTab || TabEnum.settings;

  return {
    props: { currentTab }
  };
}

export default AppDetail;
