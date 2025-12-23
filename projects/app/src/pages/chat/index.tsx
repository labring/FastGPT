import React, { useCallback, useMemo } from 'react';
import NextHead from '@/components/common/NextHead';
import { Box, Flex } from '@chakra-ui/react';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import PageContainer from '@/components/PageContainer';
import ChatSlider from '@/pageComponents/chat/slider';
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
import ChatFavouriteApp from '@/pageComponents/chat/ChatFavouriteApp';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { LoginSuccessResponse } from '@/global/support/api/userRes';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { addLog } from '@fastgpt/service/common/system/log';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { GetRecentlyUsedAppsResponseType } from '@fastgpt/service/core/app/record/type';

const Chat = ({
  myApps,
  refreshRecentlyUsed
}: {
  myApps: GetRecentlyUsedAppsResponseType;
  refreshRecentlyUsed: () => void;
}) => {
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
          <ChatSlider apps={myApps} activeAppId={appId} />
        </Box>
      )}

      {(!datasetCiteData || isPc) && (
        <PageContainer flex="1 0 0" w={0} position="relative">
          {/* home chat window */}
          {pane === ChatSidebarPaneEnum.HOME && (
            <HomeChatWindow myApps={myApps} refreshRecentlyUsed={refreshRecentlyUsed} />
          )}

          {/* favourite apps */}
          {pane === ChatSidebarPaneEnum.FAVORITE_APPS && <ChatFavouriteApp />}

          {/* team apps */}
          {pane === ChatSidebarPaneEnum.TEAM_APPS && <ChatTeamApp />}

          {/* recently used apps chat window */}
          {pane === ChatSidebarPaneEnum.RECENTLY_USED_APPS && (
            <AppChatWindow myApps={myApps} refreshRecentlyUsed={refreshRecentlyUsed} />
          )}

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

const Render = (props: {
  appId: string;
  isStandalone?: string;
  showRunningStatus: boolean;
  showCite: boolean;
  showFullText: boolean;
  canDownloadSource: boolean;
}) => {
  const { appId, isStandalone } = props;
  const { chatId } = useChatStore();
  const { setUserInfo } = useUserStore();
  const { feConfigs } = useSystemStore();
  const { isInitedUser, userInfo, myApps, refreshRecentlyUsed } = useChat(appId);

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

  const loginSuccess = useCallback(async (res: LoginSuccessResponse) => {
    setUserInfo(res.user);
  }, []);

  // Waiting for user info to be initialized
  if (!isInitedUser) {
    return (
      <PageContainer isLoading flex={'1'} p={4}>
        <NextHead title={feConfigs?.systemTitle} icon={feConfigs?.favicon} />
      </PageContainer>
    );
  }

  // Not login
  if (!userInfo) {
    return (
      <>
        <NextHead title={feConfigs?.systemTitle}></NextHead>

        <LoginModal onSuccess={loginSuccess} />
      </>
    );
  }

  // show main chat interface
  return (
    <ChatSettingContextProvider>
      <ChatContextProvider params={chatHistoryProviderParams}>
        <ChatItemContextProvider
          showRouteToDatasetDetail={isStandalone !== '1'}
          showRunningStatus={props.showRunningStatus}
          canDownloadSource={props.canDownloadSource}
          isShowCite={props.showCite}
          isShowFullText={props.showFullText}
        >
          <ChatRecordContextProvider params={chatRecordProviderParams}>
            <Chat myApps={myApps} refreshRecentlyUsed={refreshRecentlyUsed} />
          </ChatRecordContextProvider>
        </ChatItemContextProvider>
      </ChatContextProvider>
    </ChatSettingContextProvider>
  );
};

export default Render;

export async function getServerSideProps(context: any) {
  const appId = context?.query?.appId || '';

  const chatQuoteReaderConfig = await (async () => {
    try {
      if (!appId) return null;

      const config = await MongoOutLink.findOne(
        {
          appId,
          type: PublishChannelEnum.playground
        },
        'showRunningStatus showCite showFullText canDownloadSource'
      ).lean();

      return config;
    } catch (error) {
      addLog.error('getServerSideProps', error);
      return null;
    }
  })();

  return {
    props: {
      appId,
      showRunningStatus: chatQuoteReaderConfig?.showRunningStatus ?? true,
      showCite: chatQuoteReaderConfig?.showCite ?? true,
      showFullText: chatQuoteReaderConfig?.showFullText ?? true,
      canDownloadSource: chatQuoteReaderConfig?.canDownloadSource ?? true,
      ...(await serviceSideProps(context, ['file', 'app', 'chat', 'workflow']))
    }
  };
}
