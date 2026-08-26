import React, { useEffect, useMemo } from 'react';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { Box, Flex } from '@chakra-ui/react';
import ModelTable from '@/components/core/ai/ModelTable';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import dynamic from 'next/dynamic';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useRouter } from 'next/router';
import { accountPageRootStyles, accountTitleTextStyles } from '@/pageComponents/account/styles';
import {
  getAccountModelTabs,
  type AccountModelTabType
} from '@/pageComponents/account/model/tabUtils';

const ModelConfigTable = dynamic(() => import('@/pageComponents/account/model/ModelConfigTable'));
const ChannelTable = dynamic(() => import('@/pageComponents/account/model/Channel'));
const ModelLogPage = dynamic(() => import('@/pageComponents/account/model/Log'));
const ModelMonitor = dynamic(() => import('@/pageComponents/account/model/ModelDashboard'));

const ModelProvider = () => {
  const { t } = useClientTranslation(['config_model', 'account']);
  const { feConfigs, initd } = useSystemStore();
  const { userInfo } = useUserStore();
  const router = useRouter();
  const modelTabList = useMemo(
    () =>
      getAccountModelTabs(feConfigs.show_aiproxy).map((item) => ({
        label: t(item.labelKey),
        value: item.value
      })),
    [feConfigs.show_aiproxy, t]
  );
  const queryModelTab = router.query.modelTab;
  const modelTab = modelTabList.find((item) => item.value === queryModelTab)?.value ?? 'model';

  useEffect(() => {
    if (!router.isReady || !initd || feConfigs.isPlus) return;
    void router.replace('/account/info');
  }, [feConfigs.isPlus, initd, router]);

  useEffect(() => {
    if (!router.isReady || !initd || !userInfo || queryModelTab === undefined) return;
    if (typeof queryModelTab === 'string' && queryModelTab === modelTab) return;
    void router.replace(
      { pathname: router.pathname, query: { ...router.query, modelTab: 'model' } },
      undefined,
      { shallow: true }
    );
  }, [initd, modelTab, queryModelTab, router, userInfo]);

  const Tab = useMemo(
    () => (
      <FillRowTabs<AccountModelTabType>
        w={['100%', 'auto']}
        size={'sm'}
        scrollPositionKey={'account-model-tabs'}
        list={modelTabList}
        value={modelTab}
        onChange={(value) => {
          void router.replace(
            { pathname: router.pathname, query: { ...router.query, modelTab: value } },
            undefined,
            { shallow: true }
          );
        }}
      />
    ),
    [modelTab, modelTabList, router]
  );

  if (!initd || !feConfigs.isPlus) {
    return <AccountContainer isLoading>{null}</AccountContainer>;
  }

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
            {t('common:model.provider_title')}
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
          {modelTab === 'log' && <ModelLogPage Tab={Tab} />}
          {modelTab === 'monitor' && <ModelMonitor Tab={Tab} />}
        </Flex>
      </Flex>
    </AccountContainer>
  );
};

export default ModelProvider;

const ValidModelTable = ({ Tab }: { Tab: React.ReactNode }) => (
  <>
    <Flex px={[3, 6]} justifyContent={'space-between'}>
      {Tab}
    </Flex>
    <Box flex={['0 0 auto', '1 0 0']} minH={0}>
      <ModelTable permissionConfig={true} contentPx={6} />
    </Box>
  </>
);
