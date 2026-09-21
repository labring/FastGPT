import { useEffect, useMemo } from 'react';
import type React from 'react';
import { Flex } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { accountPageRootStyles } from '@/pageComponents/account/styles';

const ModelConfigTable = dynamic(() => import('@/pageComponents/model/ModelConfigTable'));
const ChannelTable = dynamic(() => import('@/pageComponents/model/Channel'));
const ChannelLog = dynamic(() => import('@/pageComponents/model/Log'));
const ModelDashboard = dynamic(() => import('@/pageComponents/model/ModelDashboard'));

type TabType = 'config' | 'channel' | 'channel_log' | 'account_model';

const ModelProvider = () => {
  const { t } = useClientTranslation(['config_model', 'config']);
  const { feConfigs } = useSystemStore();
  const router = useRouter();

  const modelTabList = useMemo<{ label: string; value: TabType }[]>(
    () => [
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
  const modelTab = modelTabList.find((item) => item.value === queryModelTab)?.value ?? 'config';

  useEffect(() => {
    if (!router.isReady || queryModelTab === undefined) return;
    if (typeof queryModelTab === 'string' && queryModelTab === modelTab) return;

    // “可用模型”及已关闭的 AI Proxy 页面都统一回退到模型配置。
    void router.replace(
      {
        pathname: router.pathname,
        query: {
          ...router.query,
          modelTab: 'config'
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
          flex={'1 0 0'}
          minH={['calc(100dvh - 78px)', 0]}
          flexDirection={'column'}
          gap={4}
          py={6}
          pt={[4, 6]}
        >
          {modelTab === 'config' && <ModelConfigTable Tab={Tab} />}
          {modelTab === 'channel' && <ChannelTable Tab={Tab} />}
          {modelTab === 'channel_log' && <ChannelLog Tab={Tab} />}
          {modelTab === 'account_model' && <ModelDashboard Tab={Tab} />}
        </Flex>
      </Flex>
    </AdminContainer>
  );
};

export default ModelProvider;
