'use client';
import { serviceSideProps } from '@/web/common/i18n/utils';
import React, { useMemo, useState } from 'react';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { Box, Flex } from '@chakra-ui/react';
import ModelTable from '@/components/core/ai/ModelTable';
import { useUserStore } from '@/web/support/user/useUserStore';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const ModelConfigTable = dynamic(() => import('@/pageComponents/account/model/ModelConfigTable'));
const ChannelTable = dynamic(() => import('@/pageComponents/account/model/Channel'));
const ChannelLog = dynamic(() => import('@/pageComponents/account/model/Log'));
const ModelDashboard = dynamic(() => import('@/pageComponents/account/model/ModelDashboard'));

type TabType = 'model' | 'config' | 'channel' | 'channel_log' | 'account_model';

const ModelProvider = () => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const [tab, setTab] = useState<TabType>('model');

  const Tab = useMemo(() => {
    return (
      <FillRowTabs<TabType>
        list={[
          { label: t('account:active_model'), value: 'model' },
          { label: t('account:config_model'), value: 'config' },
          // @ts-ignore
          ...(feConfigs?.show_aiproxy
            ? [
                { label: t('account:channel'), value: 'channel' },
                { label: t('account_model:log'), value: 'channel_log' },
                { label: t('account_model:monitoring'), value: 'account_model' }
              ]
            : [])
        ]}
        value={tab}
        py={1}
        onChange={setTab}
      />
    );
  }, [feConfigs.show_aiproxy, t, tab]);

  return (
    <AccountContainer>
      <Flex h={'100%'} flexDirection={'column'} gap={4} py={4} px={6}>
        {tab === 'model' && <ValidModelTable Tab={Tab} />}
        {tab === 'config' && <ModelConfigTable Tab={Tab} />}
        {tab === 'channel' && <ChannelTable Tab={Tab} />}
        {tab === 'channel_log' && <ChannelLog Tab={Tab} />}
        {tab === 'account_model' && <ModelDashboard Tab={Tab} />}
      </Flex>
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account', 'account_model']))
    }
  };
}

export default ModelProvider;

const ValidModelTable = ({ Tab }: { Tab: React.ReactNode }) => {
  const { userInfo } = useUserStore();
  const isRoot = userInfo?.username === 'root';
  return (
    <>
      {isRoot && <Flex justifyContent={'space-between'}>{Tab}</Flex>}
      <Box flex={'1 0 0'}>
        <ModelTable />
      </Box>
    </>
  );
};
