import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Box, Flex } from '@chakra-ui/react';
import { useUserStore } from '@/store/user';
import { useGlobalStore } from '@/store/global';
import dynamic from 'next/dynamic';
import Tabs from '@/components/Tabs';

import Settings from './components/Settings';

const Kb = dynamic(() => import('./components/Kb'), {
  ssr: true
});
const Share = dynamic(() => import('./components/Share'), {
  ssr: true
});
const API = dynamic(() => import('./components/API'), {
  ssr: true
});

enum TabEnum {
  'settings' = 'settings',
  'kb' = 'kb',
  'share' = 'share',
  'API' = 'API'
}

const ModelDetail = ({ modelId }: { modelId: string }) => {
  const router = useRouter();
  const { isPc } = useGlobalStore();
  const { modelDetail } = useUserStore();
  const [currentTab, setCurrentTab] = useState<`${TabEnum}`>(TabEnum.settings);

  useEffect(() => {
    window.onbeforeunload = (e) => {
      e.preventDefault();
      e.returnValue = '内容已修改，确认离开页面吗？';
    };

    return () => {
      window.onbeforeunload = null;
    };
  }, [router]);

  useEffect(() => {
    setCurrentTab(TabEnum.settings);
  }, [modelId]);

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
          {modelDetail.name}
        </Box>
        <Tabs
          mx={['auto', '0']}
          mt={2}
          w={['300px', '360px']}
          list={[
            { label: '配置', id: TabEnum.settings },
            { label: '知识库', id: TabEnum.kb },
            { label: '分享', id: TabEnum.share },
            { label: 'API', id: TabEnum.API },
            { label: '立即对话', id: 'startChat' }
          ]}
          size={isPc ? 'md' : 'sm'}
          activeId={currentTab}
          onChange={(e: any) => {
            if (e === 'startChat') {
              router.push(`/chat?modelId=${modelId}`);
            } else {
              setCurrentTab(e);
            }
          }}
        />
      </Box>
      <Box flex={1}>
        {currentTab === TabEnum.settings && <Settings modelId={modelId} />}
        {currentTab === TabEnum.kb && <Kb modelId={modelId} />}
        {currentTab === TabEnum.API && <API modelId={modelId} />}
        {currentTab === TabEnum.share && <Share modelId={modelId} />}
      </Box>
    </Flex>
  );
};

export default ModelDetail;
