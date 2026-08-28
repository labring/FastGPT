import { useEffect, useMemo } from 'react';
import type React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import ModelTable from '@/components/core/ai/ModelTable';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { accountPageRootStyles, accountTitleTextStyles } from '@/pageComponents/account/styles';
import ModelTabHeader from '@/pageComponents/account/model/ModelTabHeader';

const ModelConfigTable = dynamic(() => import('@/pageComponents/account/model/ModelConfigTable'));
const ChannelTable = dynamic(() => import('@/pageComponents/account/model/Channel'));
const ChannelLog = dynamic(() => import('@/pageComponents/account/model/Log'));
const ModelDashboard = dynamic(() => import('@/pageComponents/account/model/ModelDashboard'));

type TabType = 'model' | 'config' | 'channel' | 'channel_log' | 'account_model';

const ModelProvider = () => {
  const { t } = useClientTranslation(['config_model', 'config']);
  const { feConfigs } = useSystemStore();
  const router = useRouter();

  const modelTabList = useMemo<{ label: string; value: TabType }[]>(
    () => [
      { label: t('config_model:active_model'), value: 'model' },
      { label: t('config_model:config_model'), value: 'config' },
      ...(feConfigs.show_aiproxy
        ? [
            { label: t('config_model:channel'), value: 'channel' as const },
            { label: t('config_model:log'), value: 'channel_log' as const },
            { label: t('config_model:monitoring'), value: 'account_model' as const }
          ]
        : [])
    ],
    [feConfigs.show_aiproxy, t]
  );
  const queryModelTab = router.query.modelTab;
  const modelTab = modelTabList.find((item) => item.value === queryModelTab)?.value ?? 'model';

  useEffect(() => {
    if (!router.isReady || queryModelTab === undefined) return;
    if (typeof queryModelTab === 'string' && queryModelTab === modelTab) return;

    // 旧书签或手动输入可能指向已关闭的 AI Proxy 页面，统一回退到可用模型。
    void router.replace(
      {
        pathname: router.pathname,
        query: {
          ...router.query,
          modelTab: 'model'
        }
      },
      undefined,
      { shallow: true }
    );
  }, [modelTab, queryModelTab, router]);

  const Tab = useMemo(
    () => (
      <FillRowTabs<TabType>
        w={['100%', 'auto']}
        size={'sm'}
        scrollPositionKey={'config-model-tabs'}
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

  return (
    <AdminContainer>
      {/* 迁移自原 /config 页面：整体白底内容区（原 ConfigContainer 内容区为白色） */}
      <Flex {...accountPageRootStyles} bg={'white'} flexDirection={'column'}>
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
    </AdminContainer>
  );
};

const ValidModelTable = ({ Tab }: { Tab: React.ReactNode }) => (
  <>
    <ModelTabHeader Tab={Tab} />
    <Box flex={['0 0 auto', '1 0 0']} minH={0}>
      <ModelTable contentPx={6} />
    </Box>
  </>
);

export default ModelProvider;
