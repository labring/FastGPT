import { useEffect, useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { accountPageRootStyles, accountTitleTextStyles } from '@/pageComponents/account/styles';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import ModelTable from '@/components/core/ai/ModelTable';

const ModelConfigTable = dynamic(() => import('@/pageComponents/model/ModelConfigTable'));
const ChannelTable = dynamic(() => import('@/pageComponents/model/Channel'));
const ChannelLog = dynamic(() => import('@/pageComponents/model/Log'));
const ModelDashboard = dynamic(() => import('@/pageComponents/model/ModelDashboard'));

type TabType = 'active_model' | 'config' | 'channel' | 'channel_log' | 'account_model';

const ModelProvider = () => {
  const { t } = useClientTranslation(['config_model', 'config']);
  const { feConfigs, initd } = useSystemStore();
  const { userInfo } = useUserStore();
  const router = useRouter();

  const isRoot = userInfo?.username === 'root';
  const canManageModel = Boolean(
    isRoot ||
    userInfo?.team?.permission?.hasManagePer ||
    userInfo?.team?.permission?.hasModelCreateRole
  );

  const modelTabList = useMemo<{ label: string; value: TabType }[]>(
    () => [
      { label: t('config_model:active_model'), value: 'active_model' as const },
      { label: t('config_model:config_model'), value: 'config' as const },
      { label: t('config_model:channel'), value: 'channel' as const },
      { label: t('config_model:log'), value: 'channel_log' as const },
      { label: t('config_model:monitoring'), value: 'account_model' as const }
    ],
    [t]
  );

  const queryModelTab = router.query.modelTab;
  const modelTab = canManageModel
    ? (modelTabList.find((item) => item.value === queryModelTab)?.value ?? 'active_model')
    : 'active_model';

  useEffect(() => {
    if (!router.isReady || !initd || feConfigs.isPlus) return;
    void router.replace('/account/info');
  }, [feConfigs.isPlus, initd, router]);

  useEffect(() => {
    if (!router.isReady || !canManageModel || queryModelTab === undefined) return;
    if (typeof queryModelTab === 'string' && queryModelTab === modelTab) return;

    void router.replace(
      {
        pathname: router.pathname,
        query: {
          ...router.query,
          modelTab: 'active_model'
        }
      },
      undefined,
      { shallow: true }
    );
  }, [canManageModel, modelTab, queryModelTab, router]);

  const Tab = useMemo(
    () => (
      <FillRowTabs<TabType>
        w={['100%', 'auto']}
        size={'sm'}
        scrollPositionKey={'account-model-tabs'}
        list={modelTabList}
        value={modelTab}
        onChange={(value) => {
          void router.replace(
            {
              pathname: router.pathname,
              query: {
                ...router.query,
                modelTab: value
              }
            },
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
          px={6}
          alignItems={'center'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
        >
          <Box as={'h1'} {...accountTitleTextStyles}>
            {t('common:model.provider_title')}
          </Box>
        </Flex>
        {canManageModel ? (
          <Flex
            flex={'1 0 0'}
            minH={['calc(100dvh - 78px)', 0]}
            flexDirection={'column'}
            gap={4}
            py={6}
            pt={[4, 6]}
          >
            {modelTab === 'active_model' && <ModelTable permissionConfig contentPx={6} Tab={Tab} />}
            {modelTab === 'config' && <ModelConfigTable Tab={Tab} channelType="team" />}
            {modelTab === 'channel' && <ChannelTable Tab={Tab} channelType="team" />}
            {modelTab === 'channel_log' && <ChannelLog Tab={Tab} channelType="team" />}
            {modelTab === 'account_model' && <ModelDashboard Tab={Tab} channelType="team" />}
          </Flex>
        ) : (
          <Box flex={['0 0 auto', '1 0 0']} minH={0} py={6} pt={[4, 6]}>
            <ModelTable permissionConfig contentPx={6} />
          </Box>
        )}
      </Flex>
    </AccountContainer>
  );
};

export default ModelProvider;
