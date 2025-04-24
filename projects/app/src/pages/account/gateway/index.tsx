import { serviceSideProps } from '@/web/common/i18n/utils';
import React, { useMemo, useState, useEffect } from 'react';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { Box, Flex } from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import ConfigButtons from '@/pageComponents/account/gateway/ConfigButtons';
import { GateTool } from '@fastgpt/global/support/user/team/gate/type';
import { getTeamGateConfig } from '@/web/support/user/team/gate/api';
import { useToast } from '@fastgpt/web/hooks/useToast';

// 动态导入两个新组件
const HomeTable = dynamic(() => import('@/pageComponents/account/gateway/HomeTable'));
const CopyrightTable = dynamic(() => import('@/pageComponents/account/gateway/CopyrightTable'));

type TabType = 'home' | 'copyright';

const GatewayConfig = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [tab, setTab] = useState<TabType>('home');
  const [tools, setTools] = useState<GateTool[]>([]);
  const [slogan, setSlogan] = useState('你好👋，我是 FastGPT！请问有什么可以帮你?');
  const [placeholderText, setPlaceholderText] = useState('你可以问我任何问题');
  const [status, setStatus] = useState(false);
  const [teamName, setTeamName] = useState('FastGPT');

  // 加载初始配置
  useEffect(() => {
    loadGateConfig();
  }, []);

  const loadGateConfig = async () => {
    try {
      const res = await getTeamGateConfig();
      setTools(res.tools);
      setSlogan(res.slogan);
      setPlaceholderText(res.placeholderText);
      setStatus(res.status);
    } catch (error) {
      toast({
        title: t('common.Error'),
        status: 'error'
      });
    }
  };

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

  return (
    <AccountContainer>
      <Flex h={'100%'} flexDirection={'column'} gap={4} py={4} px={6}>
        <Flex alignItems={'center'}>
          {Tab}
          <Box flex={1} />
          <ConfigButtons
            tab={tab}
            tools={tools}
            slogan={slogan}
            placeholderText={placeholderText}
            status={status}
            teamName={teamName}
          />
        </Flex>

        {tab === 'home' && (
          <HomeTable
            tools={tools}
            setTools={setTools}
            slogan={slogan}
            setSlogan={setSlogan}
            placeholderText={placeholderText}
            setPlaceholderText={setPlaceholderText}
            status={status}
            setStatus={setStatus}
          />
        )}
        {tab === 'copyright' && <CopyrightTable teamName={teamName} setTeamName={setTeamName} />}
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
