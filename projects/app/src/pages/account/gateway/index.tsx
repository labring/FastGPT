import { serviceSideProps } from '@/web/common/i18n/utils';
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { Box, Flex, Spinner, Center } from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import ConfigButtons from '@/pageComponents/account/gateway/ConfigButtons';
import { useGateStore } from '@/web/support/user/team/gate/useGateStore';
import { useToast } from '@fastgpt/web/hooks/useToast';

// 动态导入两个新组件
const HomeTable = dynamic(() => import('@/pageComponents/account/gateway/HomeTable'));
const CopyrightTable = dynamic(() => import('@/pageComponents/account/gateway/CopyrightTable'));
const GateAppsList = dynamic(() => import('@/pageComponents/account/gateway/GateAppsList'));
const AppTable = dynamic(() => import('@/pageComponents/account/gateway/AppTable'));
type TabType = 'home' | 'copyright' | 'app';

const GatewayConfig = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const {
    gateConfig,
    copyRightConfig,
    gateApps,
    initGateConfig,
    initCopyRightConfig,
    loadGateApps
  } = useGateStore();

  const [tab, setTab] = useState<TabType>('home');
  const [isLoadingApps, setIsLoadingApps] = useState(true);

  // 加载初始配置
  useEffect(() => {
    initGateConfig();
    initCopyRightConfig();
  }, [initCopyRightConfig, initGateConfig]);

  // 获取 Gate 应用列表，添加重试机制
  const fetchGateApps = useCallback(
    async (retryCount = 0) => {
      try {
        setIsLoadingApps(true);
        await loadGateApps();
      } catch (error) {
        console.error('Failed to fetch gate apps:', error);

        // 添加重试逻辑，最多重试3次
        if (retryCount < 3) {
          setTimeout(
            () => {
              fetchGateApps(retryCount + 1);
            },
            1000 * (retryCount + 1)
          ); // 逐次增加重试等待时间
        }
      } finally {
        setIsLoadingApps(false);
      }
    },
    [loadGateApps]
  );

  // 应用列表加载
  useEffect(() => {
    fetchGateApps();
  }, [fetchGateApps]);

  const Tab = useMemo(() => {
    return (
      <FillRowTabs<TabType>
        list={[
          { label: t('account:config_home'), value: 'home' },
          { label: t('account:config_copyright'), value: 'copyright' },
          { label: t('account:config_app'), value: 'app' }
        ]}
        value={tab}
        py={1}
        onChange={setTab}
      />
    );
  }, [t, tab]);

  if (!gateConfig || !copyRightConfig) return null;

  return (
    <AccountContainer>
      <Flex h={'100%'}>
        {isLoadingApps ? (
          <Center w="220px" h="100%" bg="#FBFBFC" borderRight="1px solid #E8EBF0">
            <Spinner size="md" color="blue.500" thickness="3px" />
          </Center>
        ) : (
          <GateAppsList gateApps={gateApps} />
        )}
        <Flex flex={1} flexDirection={'column'} gap={4} py={4} px={6}>
          <Flex alignItems={'center'}>
            {Tab}
            <Box flex={1} />
            <ConfigButtons
              tab={tab}
              tools={gateConfig.tools}
              slogan={gateConfig.slogan}
              placeholderText={gateConfig.placeholderText}
              status={gateConfig.status}
              teamName={copyRightConfig.name}
            />
          </Flex>

          {tab === 'home' && (
            <HomeTable
              tools={gateConfig.tools}
              slogan={gateConfig.slogan}
              placeholderText={gateConfig.placeholderText}
              status={gateConfig.status}
            />
          )}
          {tab === 'copyright' && <CopyrightTable teamName={copyRightConfig.name} />}
          {tab === 'app' && <AppTable />}
        </Flex>
      </Flex>
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'account', 'account_gate']))
    }
  };
}

export default GatewayConfig;
