import React, { useCallback, useMemo, useState } from 'react';
import NextHead from '@/components/common/NextHead';
import { Box, Flex } from '@chakra-ui/react';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import PageContainer from '@/components/PageContainer';
import ChatSlider from '@/pageComponents/chat/slider';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import ChatContextProvider from '@/web/core/chat/context/chatContext';
import { useContextSelector } from 'use-context-selector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { GetChatTypeEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import QuoteReader from '@/pageComponents/chat/ChatQuoteList/QuoteReader';
import ReferencePanel from '@/pageComponents/chat/ChatQuoteList/ReferencePanel';
import ResizableDivider from '@/components/common/ResizableDivider';
import LoginModal from '@/pageComponents/login/LoginModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ChatSetting from '@/pageComponents/chat/ChatSetting';
import AppChatWindow from '@/pageComponents/chat/ChatWindow/AppChatWindow';
import HomeChatWindow from '@/pageComponents/chat/ChatWindow/HomeChatWindow';
import { ChatPageContext, ChatPageContextProvider } from '@/web/core/chat/context/chatPageContext';
import ChatTeamApp from '@/pageComponents/chat/ChatTeamApp';
import ChatFavouriteApp from '@/pageComponents/chat/ChatFavouriteApp';
import { useUserStore } from '@/web/support/user/useUserStore';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { LoginSuccessResponseType } from '@fastgpt/global/openapi/support/user/account/login/api';

const logger = getLogger(LogCategories.MODULE.CHAT.ITEM);

const Chat = () => {
  const { isPc } = useSystem();

  const { appId } = useChatStore();

  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);
  const chatType = useContextSelector(ChatItemContext, (v) => v.chatType);

  const collapse = useContextSelector(ChatPageContext, (v) => v.collapse);
  const pane = useContextSelector(ChatPageContext, (v) => v.pane);

  const [referencePanelWidth, setReferencePanelWidth] = useState(580);
  const [sidebarWidth, setSidebarWidth] = useState(226);

  const isFromPublish = chatType === ChatTypeEnum.share;
  const showReferencePanel = datasetCiteData && isFromPublish && isPc;

  const handleCloseCiteModal = useCallback(() => setCiteModalData(undefined), [setCiteModalData]);

  return (
    <Flex h={'100%'} background={'linear-gradient(180deg, #F2F8FF 0%, #F5F8FC 10%)'}>
      {/* Side bar */}
      {isPc && (
        <>
          <Box
            flexGrow={0}
            flexShrink={0}
            w={collapse ? '72px' : `${sidebarWidth}px`}
            overflow={'hidden'}
            py={[6, 0]}
            transition={'width 0.1s ease-in-out'}
          >
            <ChatSlider activeAppId={appId} />
          </Box>
          {!collapse && (
            <ResizableDivider
              minWidth={180}
              maxWidth={350}
              defaultWidth={226}
              direction="left"
              onResize={setSidebarWidth}
            />
          )}
        </>
      )}

      {(!datasetCiteData || isPc) && (
        <PageContainer
          flex="1 0 0"
          w={0}
          position="relative"
          pr={showReferencePanel ? 0 : undefined}
          insertProps={
            showReferencePanel
              ? { borderRadius: '0', borderWidth: '0' }
              : { borderRadius: '8px' }
          }
        >
          {/* home chat window */}
          {pane === ChatSidebarPaneEnum.HOME && <HomeChatWindow />}

          {/* favourite apps */}
          {pane === ChatSidebarPaneEnum.FAVORITE_APPS && <ChatFavouriteApp />}

          {/* team apps */}
          {pane === ChatSidebarPaneEnum.TEAM_APPS && <ChatTeamApp />}

          {/* recently used apps chat window */}
          {pane === ChatSidebarPaneEnum.RECENTLY_USED_APPS && <AppChatWindow />}

          {/* setting */}
          {pane === ChatSidebarPaneEnum.SETTING && <ChatSetting />}
        </PageContainer>
      )}

      {datasetCiteData && isFromPublish && isPc && (
        <>
          <ResizableDivider
            minWidth={400}
            maxWidth={900}
            defaultWidth={580}
            onResize={setReferencePanelWidth}
          />
          <Box w={`${referencePanelWidth}px`} flexShrink={0} h={'full'} overflow={'hidden'}>
            {'collectionId' in datasetCiteData.metadata ? (
              <ReferencePanel
                rawSearch={datasetCiteData.rawSearch}
                metadata={datasetCiteData.metadata}
                onClose={handleCloseCiteModal}
              />
            ) : (
              <QuoteReader
                rawSearch={datasetCiteData.rawSearch}
                metadata={datasetCiteData.metadata}
                onClose={handleCloseCiteModal}
              />
            )}
          </Box>
        </>
      )}
      {datasetCiteData && isFromPublish && !isPc && (
        <PageContainer flex="1 0 0" w={0} maxW="560px">
          {'collectionId' in datasetCiteData.metadata ? (
            <ReferencePanel
              rawSearch={datasetCiteData.rawSearch}
              metadata={datasetCiteData.metadata}
              onClose={handleCloseCiteModal}
            />
          ) : (
            <QuoteReader
              rawSearch={datasetCiteData.rawSearch}
              metadata={datasetCiteData.metadata}
              onClose={handleCloseCiteModal}
            />
          )}
        </PageContainer>
      )}
      {datasetCiteData && !isFromPublish && (
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

type ChatPageProps = {
  appId: string;
  teamId: string;
  isStandalone?: string;
  fromPublish?: string;
  showRunningStatus: boolean;
  showSkillReferences: boolean;
  showCite: boolean;
  showFullText: boolean;
  canDownloadSource: boolean;
  showWholeResponse: boolean;
};

const ChatContent = (props: ChatPageProps) => {
  const { appId, isStandalone, teamId, fromPublish } = props;
  const { chatId } = useChatStore();
  const { setUserInfo } = useUserStore();
  const { feConfigs } = useSystemStore();

  const isInitedUser = useContextSelector(ChatPageContext, (v) => v.isInitedUser);
  const userInfo = useContextSelector(ChatPageContext, (v) => v.userInfo);

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

  const loginSuccess = useCallback(
    async (res: LoginSuccessResponseType) => {
      setUserInfo(res.user);
    },
    [setUserInfo]
  );

  // Waiting for user info to be initialized
  if (!isInitedUser) {
    return (
      <PageContainer isLoading flex={'1'} p={4}>
        <NextHead title={feConfigs?.systemTitle} />
      </PageContainer>
    );
  }

  // Not login
  if (!userInfo) {
    return (
      <>
        <NextHead title={feConfigs?.systemTitle}></NextHead>

        <LoginModal onSuccess={loginSuccess} teamId={teamId} />
      </>
    );
  }

  // show main chat interface
  return (
    <ChatContextProvider params={chatHistoryProviderParams}>
      <ChatItemContextProvider
        showRouteToDatasetDetail={isStandalone !== '1'}
        showRunningStatus={props.showRunningStatus}
        showSkillReferences={props.showSkillReferences}
        canDownloadSource={props.canDownloadSource}
        isShowCite={props.showCite}
        isShowFullText={props.showFullText}
        showWholeResponse={props.showWholeResponse}
        chatType={fromPublish ? ChatTypeEnum.share : undefined}
      >
        <ChatRecordContextProvider params={chatRecordProviderParams}>
          <Chat />
        </ChatRecordContextProvider>
      </ChatItemContextProvider>
    </ChatContextProvider>
  );
};

const Render = (props: ChatPageProps) => {
  return (
    <ChatPageContextProvider appId={props.appId}>
      <ChatContent {...props} />
    </ChatPageContextProvider>
  );
};

export default Render;

export async function getServerSideProps(context: any) {
  const appId = context?.query?.appId || '';
  const fromPublish = context?.query?.fromPublish || '';

  const chatQuoteReaderConfig = await (async () => {
    try {
      if (!appId) return null;

      const config = await MongoOutLink.findOne(
        {
          appId,
          type: PublishChannelEnum.playground
        },
        'showRunningStatus showSkillReferences showCite showFullText canDownloadSource showWholeResponse'
      ).lean();

      return config;
    } catch (error) {
      logger.error('getServerSideProps failed', { error, appId });
      return null;
    }
  })();

  const teamId = await (async () => {
    try {
      if (!appId) return '';
      const app = await MongoApp.findById(appId, 'teamId').lean();
      return app?.teamId ? String(app.teamId) : '';
    } catch (error) {
      logger.error('getServerSideProps failed', { error, appId });
      return '';
    }
  })();

  return {
    props: {
      appId,
      teamId,
      fromPublish,
      showRunningStatus: chatQuoteReaderConfig?.showRunningStatus ?? true,
      showSkillReferences: chatQuoteReaderConfig?.showSkillReferences ?? false,
      showCite: chatQuoteReaderConfig?.showCite ?? true,
      showFullText: chatQuoteReaderConfig?.showFullText ?? true,
      canDownloadSource: chatQuoteReaderConfig?.canDownloadSource ?? true,
      showWholeResponse: chatQuoteReaderConfig?.showWholeResponse ?? true,
      ...(await serviceSideProps(context, [
        'file',
        'app',
        'chat',
        'workflow',
        'user',
        'login',
        'dataset',
        'dashboard_evaluation',
        'evaluation',
        'train',
        'database_client',
        'sangfor',
        'common'
      ]))
    }
  };
}
