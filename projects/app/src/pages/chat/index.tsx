import React, { useMemo } from 'react';
import NextHead from '@/components/common/NextHead';
import { Box, Flex } from '@chakra-ui/react';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import PageContainer from '@/components/PageContainer';
import SliderApps from '@/pageComponents/chat/SliderApps';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import { GetChatTypeEnum } from '@/global/core/chat/constants';
import ChatContextProvider from '@/web/core/chat/context/chatContext';
import { type AppListItemType } from '@fastgpt/global/core/app/type';
import { useContextSelector } from 'use-context-selector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import LoginModal from '@/pageComponents/login/LoginModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ChatSetting from '@/pageComponents/chat/ChatSetting';
import { useChat } from '@/pageComponents/chat/useChat';
import AppChatWindow from '@/pageComponents/chat/ChatWindow/AppChatWindow';
import HomeChatWindow from '@/pageComponents/chat/ChatWindow/HomeChatWindow';
import {
  ChatSettingContext,
  ChatSettingContextProvider
} from '@/web/core/chat/context/chatSettingContext';
import ChatTeamApp from '@/pageComponents/chat/ChatTeamApp';

const Chat = ({ myApps }: { myApps: AppListItemType[] }) => {
  const { isPc } = useSystem();

  const { appId } = useChatStore();

  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  const collapse = useContextSelector(ChatSettingContext, (v) => v.collapse);
  const pane = useContextSelector(ChatSettingContext, (v) => v.pane);

  return (
    <Flex h={'100%'}>
      {/* Side bar */}
      {isPc && (
        <Box
          flexGrow={0}
          flexShrink={0}
          w={collapse ? '72px' : '220px'}
          overflow={'hidden'}
          transition={'width 0.1s ease-in-out'}
        >
          <SliderApps apps={myApps} activeAppId={appId} />
        </Box>
      )}

      {(!datasetCiteData || isPc) && (
        <PageContainer flex="1 0 0" w={0} position="relative">
          {/* home chat window */}
          {pane === ChatSidebarPaneEnum.HOME && <HomeChatWindow myApps={myApps} />}

          {/* recently used apps chat window */}
          {pane === ChatSidebarPaneEnum.RECENTLY_USED_APPS && <AppChatWindow myApps={myApps} />}

          {/* team apps */}
          {pane === ChatSidebarPaneEnum.TEAM_APPS && <ChatTeamApp />}

          {/* setting */}
          {pane === ChatSidebarPaneEnum.SETTING && <ChatSetting />}
        </PageContainer>
      )}

      {datasetCiteData && (
        <PageContainer flex="1 0 0" w={0} maxW="560px">
          <ChatQuoteList
            metadata={datasetCiteData.metadata}
            rawSearch={datasetCiteData.rawSearch}
            onClose={() => setCiteModalData(undefined)}
          />
        </PageContainer>
      )}
    </Flex>
  );
};

const Render = (props: { appId: string; isStandalone?: string }) => {
  const { appId, isStandalone } = props;
  const { chatId } = useChatStore();
  const { feConfigs } = useSystemStore();
  const { isInitedUser, userInfo, myApps } = useChat(appId);

  const chatHistoryProviderParams = useMemo(
    () => ({ appId, source: ChatSourceEnum.online }),
    [appId]
  );

  const chatRecordProviderParams = useMemo(() => {
    return {
      appId,
      type: GetChatTypeEnum.normal,
      chatId
    };
  }, [appId, chatId]);

  // Waiting for user info to be initialized
  if (!isInitedUser) {
    return (
      <PageContainer isLoading flex={'1'} p={4}>
        <NextHead title={feConfigs?.systemTitle}></NextHead>
      </PageContainer>
    );
  }

  // Not login
  if (!userInfo) {
    return (
      <>
        <NextHead title={feConfigs?.systemTitle}></NextHead>

        <LoginModal />
      </>
    );
  }

  // show main chat interface
  return (
    <ChatSettingContextProvider>
      <ChatContextProvider params={chatHistoryProviderParams}>
        <ChatItemContextProvider
          showRouteToDatasetDetail={isStandalone !== '1'}
          isShowReadRawSource={true}
          isResponseDetail={true}
          showNodeStatus
        >
          <ChatRecordContextProvider params={chatRecordProviderParams}>
            <Chat myApps={myApps} />
          </ChatRecordContextProvider>
        </ChatItemContextProvider>
      </ChatContextProvider>
    </ChatSettingContextProvider>
  );
};

export async function getServerSideProps(context: any) {
  return {
    props: {
      appId: context?.query?.appId || '',
      isStandalone: context?.query?.isStandalone || '',
      ...(await serviceSideProps(context, ['file', 'app', 'chat', 'workflow', 'user', 'login']))
    }
  };
}

export default Render;
