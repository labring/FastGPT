'use client';
import { serviceSideProps } from '@/web/common/i18n/utils';
import React, { useMemo, useState } from 'react';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { Box, Flex } from '@chakra-ui/react';
import ModelTable from '@/components/core/ai/ModelTable';
import { MyTabs } from '@fastgpt/web/components/common/MyTabs';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';

const ModelConfigTable = dynamic(() => import('@/pageComponents/account/model/ModelConfigTable'));
const ChannelTable = dynamic(() => import('@/pageComponents/account/model/Channel'));
const ChannelLog = dynamic(() => import('@/pageComponents/account/model/Log'));
const ModelDashboard = dynamic(() => import('@/pageComponents/account/model/ModelDashboard'));

type TabType = 'model' | 'config' | 'channel' | 'channel_log' | 'account_model';

const ModelProvider = () => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { userInfo } = useUserStore();
  const isRoot = userInfo?.username === 'root';

  const [tab, setTab] = useState<TabType>('model');

  const tabList = useMemo(() => {
    return [
      { label: t('account:active_model'), value: 'model' },
      { label: t('account:config_model'), value: 'config' },
      ...(feConfigs?.show_aiproxy
        ? [
            { label: t('account:channel'), value: 'channel' },
            { label: t('account_model:log'), value: 'channel_log' },
            { label: t('account_model:monitoring'), value: 'account_model' }
          ]
        : [])
    ];
  }, [feConfigs.show_aiproxy, t]);

  const header = (
    <Flex alignItems={'center'} position={'relative'} flex={1}>
      <Box fontSize={'lg'} fontWeight={'medium'} lineHeight="26px" color={'black'}>
        {t('account_model:model_management')}
      </Box>
      {isRoot && (
        <Box position={'absolute'} left={'50%'} transform={'translateX(-50%)'}>
          <MyTabs tabs={tabList} value={tab} onChange={(value) => setTab(value as TabType)} />
        </Box>
      )}
    </Flex>
  );

  return (
    <AccountContainer
      header={header}
      wrapperContainerProps={{ py: 0 }}
      containerInsertProps={{ borderRadius: '8px' }}
    >
      <Flex h={'100%'} flexDirection={'column'} p={4}>
        <Flex flex={'1 0 0'} overflow={'hidden'} direction={'column'}>
          {tab === 'model' && <ValidModelTable />}
          {tab === 'config' && <ModelConfigTable />}
          {tab === 'channel' && <ChannelTable />}
          {tab === 'channel_log' && <ChannelLog />}
          {tab === 'account_model' && <ModelDashboard />}
        </Flex>
      </Flex>
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, [
        'account',
        'account_model',
        'user',
        'app',
        'train',
        'chat'
      ]))
    }
  };
}

export default ModelProvider;

const ValidModelTable = () => {
  return <ModelTable permissionConfig={true} />;
};
