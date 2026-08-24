import { useCallback, useEffect, useMemo } from 'react';
import type React from 'react';
import { useRouter } from 'next/router';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import SecondaryNavigationContainer from '@/pageComponents/common/SecondaryNavigationContainer';

export enum ConfigTabEnum {
  plugin = 'plugin',
  model = 'model'
}

const ConfigContainer = ({
  children,
  isLoading
}: {
  children: React.ReactNode;
  isLoading?: boolean;
}) => {
  const { t } = useClientTranslation('config');
  const router = useRouter();
  const { initd } = useSystemStore();
  const { userInfo } = useUserStore();
  const isRoot = userInfo?.username === 'root';

  const currentTab = useMemo(
    () =>
      router.pathname.startsWith('/config/model') ? ConfigTabEnum.model : ConfigTabEnum.plugin,
    [router.pathname]
  );
  const tabList = useMemo(
    () => [
      {
        icon: 'common/toolkit',
        label: t('config:system_tool_management'),
        value: ConfigTabEnum.plugin
      },
      {
        icon: 'common/model',
        label: t('config:model_provider'),
        value: ConfigTabEnum.model
      }
    ],
    [t]
  );

  useEffect(() => {
    if (!router.isReady || !initd || !userInfo || isRoot) return;
    void router.replace('/account/info');
  }, [initd, isRoot, router, userInfo]);

  const setCurrentTab = useCallback(
    (tab: ConfigTabEnum) => {
      void router.replace(tab === ConfigTabEnum.plugin ? '/config/plugin/tool' : '/config/model');
    },
    [router]
  );

  return (
    <SecondaryNavigationContainer
      isLoading={isLoading || !initd || !isRoot}
      tabs={tabList}
      value={currentTab}
      onChange={setCurrentTab}
      mobileScrollPositionKey={'config-mobile-navigation'}
    >
      {children}
    </SecondaryNavigationContainer>
  );
};

export default ConfigContainer;
