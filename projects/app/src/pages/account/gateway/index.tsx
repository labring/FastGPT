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
import { getTeamGateConfig, getTeamGateConfigCopyRight } from '@/web/support/user/team/gate/api';
import type { GateSchemaType } from '@fastgpt/global/support/user/team/gate/type';
import type { getGateConfigCopyRightResponse } from '@fastgpt/global/support/user/team/gate/api';
import { putUpdateGateConfigCopyRightData } from '@fastgpt/global/support/user/team/gate/api';

// 动态导入两个新组件
const HomeTable = dynamic(() => import('@/pageComponents/account/gateway/HomeTable'));
const CopyrightTable = dynamic(() => import('@/pageComponents/account/gateway/CopyrightTable'));
const GateAppsList = dynamic(() => import('@/pageComponents/account/gateway/GateAppsList'));
const AppTable = dynamic(() => import('@/pageComponents/account/gateway/AppTable'));
type TabType = 'home' | 'copyright' | 'app';

const GatewayConfig = () => {
  const { t } = useTranslation();
  const { gateApps, loadGateApps } = useGateStore();
  const [gateConfig, setGateConfig] = useState<GateSchemaType | undefined>(undefined);
  const [copyRightConfig, setCopyRightConfig] = useState<
    getGateConfigCopyRightResponse | undefined
  >(undefined);
  const [tab, setTab] = useState<TabType>('home');
  const [isLoadingApps, setIsLoadingApps] = useState(true);

  // 添加 handleStatusChange 函数
  const handleStatusChange = useCallback(
    (newStatus: boolean) => {
      if (!gateConfig) return;
      setGateConfig({
        ...gateConfig,
        status: newStatus
      });
    },
    [gateConfig]
  );
  // 添加 handleToolsChange 函数
  const handleToolsChange = useCallback(
    (newTools: string[]) => {
      if (!gateConfig) return;
      setGateConfig({
        ...gateConfig,
        tools: newTools
      });
    },
    [gateConfig]
  );

  // 添加 handleSloganChange 函数
  const handleSloganChange = useCallback(
    (newSlogan: string) => {
      if (!gateConfig) return;
      setGateConfig({
        ...gateConfig,
        slogan: newSlogan
      });
    },
    [gateConfig]
  );

  const handlePlaceholderChange = useCallback(
    (newPlaceholder: string) => {
      if (!gateConfig) return;
      setGateConfig({
        ...gateConfig,
        placeholderText: newPlaceholder
      });
    },
    [gateConfig]
  );
  const handleCopyRightNameChange = useCallback(
    (newName: string) => {
      if (!copyRightConfig) return;
      setCopyRightConfig({
        ...copyRightConfig,
        name: newName
      });
    },
    [copyRightConfig]
  );
  const handleCopyRightLogoChange = useCallback(
    (newLogo: string) => {
      if (!copyRightConfig) return;
      setCopyRightConfig({
        ...copyRightConfig,
        logo: newLogo
      });
    },
    [copyRightConfig]
  );
  const handleCopyRightBannerChange = useCallback(
    (newBanner: string) => {
      if (!copyRightConfig) return;
      setCopyRightConfig({
        ...copyRightConfig,
        banner: newBanner
      });
    },
    [copyRightConfig]
  );

  // 加载 gateConfig
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await getTeamGateConfig();
        setGateConfig(config);
        const copyRightConfig = await getTeamGateConfigCopyRight();
        setCopyRightConfig(copyRightConfig);
      } catch (error) {
        console.error('Failed to load gate config:', error);
      }
    };
    loadConfig();
  }, []);

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
  // 设置标志让在app tab下不显示 config按钮
  const isAppTab = useMemo(() => tab === 'app', [tab]);

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

  const content = useMemo(() => {
    if (!gateConfig || !copyRightConfig) {
      return (
        <Center w="100%" h="100%">
          <Spinner size="md" color="blue.500" thickness="3px" />
        </Center>
      );
    }

    return (
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
            {!isAppTab && (
              <ConfigButtons tab={tab} gateConfig={gateConfig} copyRightConfig={copyRightConfig} />
            )}
          </Flex>

          {tab === 'home' && (
            <HomeTable
              tools={gateConfig.tools}
              slogan={gateConfig.slogan}
              placeholderText={gateConfig.placeholderText}
              status={gateConfig.status}
              onToolsChange={handleToolsChange}
              onStatusChange={handleStatusChange}
              onSloganChange={handleSloganChange}
              onPlaceholderChange={handlePlaceholderChange}
            />
          )}
          {tab === 'copyright' && (
            <CopyrightTable
              gateName={copyRightConfig.name}
              gateLogo={copyRightConfig.logo}
              gateBanner={copyRightConfig.banner}
              onNameChange={handleCopyRightNameChange}
              onLogoChange={handleCopyRightLogoChange}
              onBannerChange={handleCopyRightBannerChange}
            />
          )}
          {tab === 'app' && <AppTable />}
        </Flex>
      </Flex>
    );
  }, [
    gateConfig,
    copyRightConfig,
    isLoadingApps,
    gateApps,
    Tab,
    isAppTab,
    tab,
    handleToolsChange,
    handleStatusChange,
    handleSloganChange,
    handlePlaceholderChange,
    handleCopyRightNameChange,
    handleCopyRightLogoChange,
    handleCopyRightBannerChange
  ]);

  return <AccountContainer>{content}</AccountContainer>;
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'account', 'account_gate']))
    }
  };
}

export default GatewayConfig;
