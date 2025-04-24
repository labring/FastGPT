import { serviceSideProps } from '@/web/common/i18n/utils';
import React, { useMemo, useState, useEffect } from 'react';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { Box, Flex } from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import ConfigButtons from '@/pageComponents/account/gateway/ConfigButtons';
import { useGateStore } from '@/web/support/user/team/gate/useGateStore';

// 动态导入两个新组件
const HomeTable = dynamic(() => import('@/pageComponents/account/gateway/HomeTable'));
const CopyrightTable = dynamic(() => import('@/pageComponents/account/gateway/CopyrightTable'));

type TabType = 'home' | 'copyright';

const GatewayConfig = () => {
  const { t } = useTranslation();
  const { gateConfig, copyRightConfig, initGateConfig, initCopyRightConfig } = useGateStore();

  const [tab, setTab] = useState<TabType>('home');

  // 加载初始配置
  useEffect(() => {
    initGateConfig();
    initCopyRightConfig();
  }, []);

  const Tab = useMemo(() => {
    return (
      <FillRowTabs<TabType>
        list={[
          { label: t('account:config_home'), value: 'home' },
          { label: t('account:config_copyright'), value: 'copyright' }
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
      <Flex h={'100%'} flexDirection={'column'} gap={4} py={4} px={6}>
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
      </Flex>
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account', 'account_gate']))
    }
  };
}

export default GatewayConfig;
