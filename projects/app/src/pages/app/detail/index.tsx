import React, { useEffect } from 'react';
import { Box } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { serviceSideProps } from '@/web/common/i18n/utils';
import NextHead from '@/components/common/NextHead';
import { useContextSelector } from 'use-context-selector';
import AppContextProvider, { AppContext } from '@/pageComponents/app/detail/context';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { TabEnum } from '@/pageComponents/app/detail/context';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { DashboardNavbar, SIDEBAR_COLLAPSED_WIDTH } from '@/pageComponents/dashboard/Container';

const SimpleEdit = dynamic(() => import('@/pageComponents/app/detail/Edit/SimpleApp'));
const AgentEdit = dynamic(() => import('@/pageComponents/app/detail/Edit/ChatAgent'));
const Workflow = dynamic(() => import('@/pageComponents/app/detail/Workflow'));
const Plugin = dynamic(() => import('@/pageComponents/app/detail/Plugin'));
const MCPTools = dynamic(() => import('@/pageComponents/app/detail/Edit/MCPTools'));
const SmartCustomerService = dynamic(
  () => import('@/pageComponents/app/detail/SmartCustomerService')
);
const HTTPTools = dynamic(() => import('@/pageComponents/app/detail/Edit/HTTPTools'));

const AppDetail = () => {
  const { setAppId, setSource } = useChatStore();
  const appDetail = useContextSelector(AppContext, (e) => e.appDetail);
  const route2Tab = useContextSelector(AppContext, (e) => e.route2Tab);
  const { isPc } = useSystem();

  const hideSidebar = appDetail.type === AppTypeEnum.workflow;

  useEffect(() => {
    setSource('test');
    if (appDetail._id) {
      setAppId(appDetail._id);

      if (!appDetail.permission.hasWritePer) {
        route2Tab(TabEnum.logs);
      }
    }
  }, [appDetail._id]);

  return (
    <>
      <NextHead title={appDetail.name} icon={appDetail.avatar}></NextHead>
      {isPc && !hideSidebar && (
        <DashboardNavbar isCollapsed={true} setIsCollapsed={() => {}} hideCollapseButton />
      )}
      <Box
        h={'100%'}
        pl={isPc && !hideSidebar ? SIDEBAR_COLLAPSED_WIDTH : 0}
        position={'relative'}
        bgGradient="linear(180deg, #F2F8FF 0%, #F7F9FC 12%)"
        transition="padding-left 0.2s ease"
      >
        {!appDetail._id ? (
          <Loading fixed={false} />
        ) : (
          <>
            {appDetail.type === AppTypeEnum.simple && <SimpleEdit />}
            {appDetail.type === AppTypeEnum.chatAgent && <AgentEdit />}
            {appDetail.type === AppTypeEnum.workflow && <Workflow />}
            {appDetail.type === AppTypeEnum.workflowTool && <Plugin />}
            {appDetail.type === AppTypeEnum.mcpToolSet && <MCPTools />}
            {appDetail.type === AppTypeEnum.httpToolSet && <HTTPTools />}
            {appDetail.type === AppTypeEnum.assistant && <SmartCustomerService />}
          </>
        )}
      </Box>
    </>
  );
};

const Provider = () => {
  return (
    <AppContextProvider>
      <AppDetail />
    </AppContextProvider>
  );
};

export async function getServerSideProps(context: any) {
  return {
    // TODO: 精简 i18n，避免交叉使用。
    props: {
      ...(await serviceSideProps(context, [
        'app',
        'chat',
        'user',
        'file',
        'publish',
        'workflow',
        'skill',
        'dashboard_evaluation',
        'evaluation',
        'database_client',
        'skill'
      ]))
    }
  };
}

export default Provider;
