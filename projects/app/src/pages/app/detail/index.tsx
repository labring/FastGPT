import React, { useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Box, Flex, IconButton, useTheme } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useSystemStore } from '@/web/common/system/useSystemStore';

import Tabs from '@/components/Tabs';
import SideTabs from '@/components/SideTabs';
import Avatar from '@/components/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import PageContainer from '@/components/PageContainer';
import Loading from '@fastgpt/web/components/common/MyLoading';
import SimpleEdit from './components/SimpleEdit';
import { serviceSideProps } from '@/web/common/utils/i18n';
import Head from 'next/head';
import { useTranslation } from 'next-i18next';
import { useI18n } from '@/web/context/I18n';
import { AppContext, AppContextProvider } from '@/web/core/app/context/appContext';
import { useContextSelector } from 'use-context-selector';

const FlowEdit = dynamic(() => import('./components/FlowEdit'), {
  loading: () => <Loading />
});
const Publish = dynamic(() => import('./components/Publish'), {});
const Logs = dynamic(() => import('./components/Logs'), {});

enum TabEnum {
  'simpleEdit' = 'simpleEdit',
  'adEdit' = 'adEdit',
  'publish' = 'publish',
  'logs' = 'logs',
  'startChat' = 'startChat'
}

const AppDetail = ({ appId, currentTab }: { appId: string; currentTab: TabEnum }) => {
  const { t } = useTranslation();
  const { appT } = useI18n();
  const router = useRouter();
  const theme = useTheme();
  const { feConfigs } = useSystemStore();
  const { appDetail, loadingApp } = useContextSelector(AppContext, (e) => e);

  const setCurrentTab = useCallback(
    (tab: TabEnum) => {
      router.push({
        query: {
          ...router.query,
          currentTab: tab
        }
      });
    },
    [router]
  );

  const tabList = useMemo(
    () => [
      {
        label: t('core.app.navbar.Simple mode'),
        id: TabEnum.simpleEdit,
        icon: 'common/overviewLight'
      },

      {
        label: t('core.app.navbar.Flow mode'),
        id: TabEnum.adEdit,
        icon: 'core/modules/flowLight'
      },
      ...(appDetail.permission.hasManagePer
        ? [
            {
              label: t('core.app.navbar.Publish app'),
              id: TabEnum.publish,
              icon: 'support/outlink/shareLight'
            },
            { label: appT('Chat logs'), id: TabEnum.logs, icon: 'core/app/logsLight' }
          ]
        : []),
      { label: t('core.Start chat'), id: TabEnum.startChat, icon: 'core/chat/chatLight' }
    ],
    [appDetail.permission.hasManagePer, appT, t]
  );

  const onCloseFlowEdit = useCallback(() => setCurrentTab(TabEnum.simpleEdit), [setCurrentTab]);

  return (
    <>
      <Head>
        <title>{appDetail.name}</title>
      </Head>
      <PageContainer isLoading={loadingApp}>
        {!loadingApp && (
          <Flex flexDirection={['column', 'row']} h={'100%'}>
            {/* pc tab */}
            <Box
              display={['none', 'flex']}
              flexDirection={'column'}
              p={4}
              w={'180px'}
              borderRight={theme.borders.base}
            >
              <Flex mb={4} alignItems={'center'}>
                <Avatar src={appDetail.avatar} w={'34px'} borderRadius={'md'} />
                <Box ml={2} fontSize={'sm'} fontWeight={'bold'}>
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
                  icon={<MyIcon name={'common/backFill'} w={'18px'} color={'primary.500'} />}
                  bg={'white'}
                  boxShadow={'1px 1px 9px rgba(0,0,0,0.15)'}
                  size={'smSquare'}
                  borderRadius={'50%'}
                  aria-label={''}
                />
                {appT('My Apps')}
              </Flex>
            </Box>
            {/* phone tab */}
            <Box display={['block', 'none']} textAlign={'center'} py={3}>
              <Box className="textlg" fontSize={'lg'} fontWeight={'bold'}>
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
              {currentTab === TabEnum.simpleEdit && <SimpleEdit appId={appId} />}
              {currentTab === TabEnum.adEdit && appDetail && <FlowEdit onClose={onCloseFlowEdit} />}
              {currentTab === TabEnum.logs && <Logs appId={appId} />}
              {currentTab === TabEnum.publish && <Publish appId={appId} />}
            </Box>
          </Flex>
        )}
      </PageContainer>
    </>
  );
};

const Provider = ({ appId, currentTab }: { appId: string; currentTab: TabEnum }) => {
  return (
    <AppContextProvider appId={appId}>
      <AppDetail appId={appId} currentTab={currentTab} />
    </AppContextProvider>
  );
};

export async function getServerSideProps(context: any) {
  const currentTab = context?.query?.currentTab || TabEnum.simpleEdit;
  const appId = context?.query?.appId || '';

  return {
    props: {
      currentTab,
      appId,
      ...(await serviceSideProps(context, ['app', 'chat', 'file', 'publish', 'workflow']))
    }
  };
}

export default Provider;
