import React, { useMemo } from 'react';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { Box, Flex } from '@chakra-ui/react';
import ModelTable from '@/components/core/ai/ModelTable';
import { useUserStore } from '@/web/support/user/useUserStore';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import dynamic from 'next/dynamic';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { accountPageRootStyles, accountTitleTextStyles } from '@/pageComponents/account/styles';
import ModelTabHeader from '@/pageComponents/account/model/ModelTabHeader';
import { useRouter } from 'next/router';

const ModelConfigTable = dynamic(() => import('@/pageComponents/account/model/ModelConfigTable'));
const ChannelTable = dynamic(() => import('@/pageComponents/account/model/Channel'));
const ChannelLog = dynamic(() => import('@/pageComponents/account/model/Log'));
const ModelDashboard = dynamic(() => import('@/pageComponents/account/model/ModelDashboard'));

type TabType = 'model' | 'config' | 'channel' | 'channel_log' | 'account_model';

const ModelProvider = () => {
  const { t } = useClientTranslation(['account_model', 'account']);
  const { feConfigs } = useSystemStore();
  const router = useRouter();
  const { modelTab = 'model' } = router.query as { modelTab?: TabType };

  const Tab = useMemo(() => {
    return (
      <FillRowTabs<TabType>
        w={['100%', 'auto']}
        size={'sm'}
        scrollPositionKey={'account-model-tabs'}
        list={[
          { label: t('account_model:active_model'), value: 'model' },
          { label: t('account_model:config_model'), value: 'config' },
          // @ts-ignore
          ...(feConfigs?.show_aiproxy
            ? [
                { label: t('account_model:channel'), value: 'channel' },
                { label: t('account_model:log'), value: 'channel_log' },
                { label: t('account_model:monitoring'), value: 'account_model' }
              ]
            : [])
        ]}
        value={modelTab}
        onChange={(value) => {
          router.replace({
            query: {
              ...router.query,
              modelTab: value
            }
          });
        }}
      />
    );
  }, [feConfigs.show_aiproxy, modelTab, router, t]);

  return (
    <AccountContainer>
      <Flex {...accountPageRootStyles} flexDirection={'column'}>
        <Flex
          display={['none', 'flex']}
          h={'64px'}
          flexShrink={0}
          px={[4, 6]}
          alignItems={'center'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
        >
          <Box as={'h1'} {...accountTitleTextStyles}>
            {t('account:model_provider')}
          </Box>
        </Flex>
        <Flex
          flex={'1 0 0'}
          minH={['calc(100dvh - 78px)', 0]}
          flexDirection={'column'}
          gap={4}
          py={6}
        >
          {modelTab === 'model' && <ValidModelTable Tab={Tab} />}
          {modelTab === 'config' && <ModelConfigTable Tab={Tab} />}
          {modelTab === 'channel' && <ChannelTable Tab={Tab} />}
          {modelTab === 'channel_log' && <ChannelLog Tab={Tab} />}
          {modelTab === 'account_model' && <ModelDashboard Tab={Tab} />}
        </Flex>
      </Flex>
    </AccountContainer>
  );
};

export default ModelProvider;

const ValidModelTable = ({ Tab }: { Tab: React.ReactNode }) => {
  const { userInfo } = useUserStore();
  const isRoot = userInfo?.username === 'root';
  return (
    <>
      {isRoot && <ModelTabHeader Tab={Tab} />}
      <Box flex={['0 0 auto', '1 0 0']} minH={0}>
        <ModelTable permissionConfig={true} contentPx={6} />
      </Box>
    </>
  );
};
