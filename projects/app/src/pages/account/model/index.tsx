import React, { useMemo, useState } from 'react';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { Box, Flex } from '@chakra-ui/react';
import ModelTable from '@/components/core/ai/ModelTable';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import dynamic from 'next/dynamic';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const ModelConfigTable = dynamic(() => import('@/pageComponents/account/model/ModelConfigTable'));
const ChannelTable = dynamic(() => import('@/pageComponents/account/model/Channel'));
const ModelLogPage = dynamic(() => import('@/pageComponents/account/model/Log'));
const ModelMonitor = dynamic(() => import('@/pageComponents/account/model/ModelDashboard'));

// Design §5.1: available models, configuration, channels, logs, and monitoring.
type TabType = 'model' | 'config' | 'channel' | 'log' | 'monitor';

const ModelProvider = () => {
  const { t } = useClientTranslation('account_model');
  const { feConfigs } = useSystemStore();

  const [tab, setTab] = useState<TabType>('model');

  const Tab = useMemo(() => {
    return (
      <FillRowTabs<TabType>
        list={[
          { label: t('account_model:active_model'), value: 'model' },
          { label: t('account_model:config_model'), value: 'config' },
          // @ts-ignore
          ...(feConfigs?.show_aiproxy
            ? [
                { label: t('account_model:channel'), value: 'channel' },
                { label: t('account_model:log'), value: 'log' },
                { label: t('account_model:monitoring'), value: 'monitor' }
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
        {tab === 'log' && <ModelLogPage Tab={Tab} />}
        {tab === 'monitor' && <ModelMonitor Tab={Tab} />}
      </Flex>
    </AccountContainer>
  );
};

export default ModelProvider;

const ValidModelTable = ({ Tab }: { Tab: React.ReactNode }) => {
  return (
    <>
      <Flex justifyContent={'space-between'}>{Tab}</Flex>
      <Box flex={'1 0 0'}>
        <ModelTable permissionConfig={true} />
      </Box>
    </>
  );
};
