import { serviceSideProps } from '@/web/common/i18n/utils';
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { Box, Flex, Spinner, Center } from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import ConfigButtons from '@/pageComponents/account/gateway/ConfigButtons';
import { getTeamGateConfig, getTeamGateConfigCopyRight } from '@/web/support/user/team/gate/api';
import type { GateSchemaType } from '@fastgpt/global/support/user/team/gate/type';
import type { getGateConfigCopyRightResponse } from '@fastgpt/global/support/user/team/gate/api';
import { getAppDetailById, getMyAppsGate } from '@/web/core/app/api';
import type {
  AppDetailType,
  AppListItemType,
  AppSimpleEditFormType
} from '@fastgpt/global/core/app/type';
import { defaultApp } from '@/web/core/app/constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import router from 'next/router';

// 动态导入两个新组件
const HomeTable = dynamic(() => import('@/pageComponents/account/gateway/HomeTable'));
const CopyrightTable = dynamic(() => import('@/pageComponents/account/gateway/CopyrightTable'));
const GateAppsList = dynamic(() => import('@/pageComponents/account/gateway/GateAppsList'));
const AppTable = dynamic(() => import('@/pageComponents/account/gateway/AppTable'));
const Logs = dynamic(() => import('@/pageComponents/account/gateway/logs'));
type TabType = 'home' | 'copyright' | 'app' | 'logs';

const GatewayConfig = () => {
  const { t } = useTranslation();
  const [gateConfig, setGateConfig] = useState<GateSchemaType>();
  // 添加 appForm 状态
  const [appForm, setAppForm] = useState<AppSimpleEditFormType>();
  //从 appForm 中获取 selectedTools的 id 组成 string 数组

  //gateConfig?.tools 改成
  const [copyRightConfig, setCopyRightConfig] = useState<getGateConfigCopyRightResponse>();
  const [tab, setTab] = useState<TabType>('home');
  const [isLoadingApps, setIsLoadingApps] = useState(true);
  const [gateApps, setGateApps] = useState<AppListItemType[]>([]);
  useEffect(() => {
    const fetchGateApps = async () => {
      try {
        const gateApps = await getMyAppsGate();
        setGateApps(gateApps);
        setIsLoadingApps(false);
      } catch (error) {
        console.error('Failed to load gate apps:', error);
        setIsLoadingApps(false);
      }
    };

    fetchGateApps();
  }, []);

  console.log('gateAppsList', gateApps);
  const gateAppId = useMemo(() => gateApps[0]?._id || '', [gateApps]);
  const [appDetail, setAppDetail] = useState<AppDetailType>(defaultApp);

  const { loading: loadingApp, runAsync: reloadApp } = useRequest2(
    () => {
      if (gateAppId) {
        return getAppDetailById(gateAppId);
      }
      return Promise.resolve(defaultApp);
    },
    {
      manual: false,
      refreshDeps: [gateAppId],
      errorToast: t('common:core.app.error.Get app failed'),
      onError(err: any) {
        router.replace('/dashboard/apps');
      },
      onSuccess(res) {
        setAppDetail(res);
      }
    }
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
  // 添加 handleAppFormChange 函数
  const handleAppFormChange = useCallback(
    (newAppForm: AppSimpleEditFormType) => {
      setAppForm(newAppForm);
      handleToolsChange(
        newAppForm.selectedTools
          .map((tool) => tool.pluginId)
          .filter((id): id is string => id !== undefined) || []
      );
    },
    [handleToolsChange]
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

  // 设置标志让在app tab下不显示 config按钮
  const isAppTab = useMemo(() => tab === 'app', [tab]);

  const Tab = useMemo(() => {
    return (
      <FillRowTabs<TabType>
        list={[
          { label: t('account:config_home'), value: 'home' },
          { label: t('account:config_copyright'), value: 'copyright' },
          { label: t('account:config_app'), value: 'app' },
          { label: t('account:logs'), value: 'logs' }
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
        <Flex flex={1} flexDirection={'column'} gap={4} py={4} px={6}>
          <Flex alignItems={'center'}>
            {Tab}
            <Box flex={1} />
            {!isAppTab && (
              <ConfigButtons
                tab={tab}
                appForm={appForm}
                gateConfig={gateConfig}
                copyRightConfig={copyRightConfig}
              />
            )}
          </Flex>

          {tab === 'home' && (
            <HomeTable
              appDetail={appDetail}
              tools={gateConfig.tools}
              slogan={gateConfig.slogan}
              placeholderText={gateConfig.placeholderText}
              onToolsChange={handleToolsChange}
              onSloganChange={handleSloganChange}
              onPlaceholderChange={handlePlaceholderChange}
              // 添加 appForm 相关 props
              onAppFormChange={handleAppFormChange}
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
          {tab === 'logs' && <Logs gateAppId={gateAppId} />}
        </Flex>
      </Flex>
    );
  }, [
    gateConfig,
    copyRightConfig,
    Tab,
    isAppTab,
    tab,
    appForm,
    appDetail,
    handleToolsChange,
    handleSloganChange,
    handlePlaceholderChange,
    handleAppFormChange,
    handleCopyRightNameChange,
    handleCopyRightLogoChange,
    handleCopyRightBannerChange,
    gateAppId
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
