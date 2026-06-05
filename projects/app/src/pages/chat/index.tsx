import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import LoginModal from '@/pageComponents/login/LoginModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ChatSetting from '@/pageComponents/chat/ChatSetting';
import AppChatWindow from '@/pageComponents/chat/ChatWindow/AppChatWindow';
import HomeChatWindow from '@/pageComponents/chat/ChatWindow/HomeChatWindow';
import { ChatPageContext, ChatPageContextProvider } from '@/web/core/chat/context/chatPageContext';
import ChatAllApp from '@/pageComponents/chat/ChatAllApp';
import { useUserStore } from '@/web/support/user/useUserStore';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { LoginSuccessResponseType } from '@fastgpt/global/openapi/support/user/account/login/api';

const logger = getLogger(LogCategories.MODULE.CHAT.ITEM);

const Chat = () => {
  const { isPc } = useSystem();

  const { appId, chatId } = useChatStore();

  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);
  const resetChatItemUIState = useContextSelector(ChatItemContext, (v) => v.resetUIState);

  const collapse = useContextSelector(ChatPageContext, (v) => v.collapse);
  const pane = useContextSelector(ChatPageContext, (v) => v.pane);
  const rightWindowStyle = useMemo(
    () => ({
      borderWidth: 0,
      boxShadow: 'none',
      bg: 'white'
    }),
    []
  );

  useEffect(() => {
    resetChatItemUIState();
  }, [appId, chatId, resetChatItemUIState]);

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
          <ChatSlider activeAppId={appId} />
        </Box>
      )}

      {(!datasetCiteData || isPc) && (
        <PageContainer
          flex="1 0 0"
          w={0}
          position="relative"
          pr={datasetCiteData ? 0 : undefined}
          insertProps={{
            ...rightWindowStyle,
            ...(datasetCiteData
              ? {
                  borderRadius: [0, '16px 0 0 16px']
                }
              : {})
          }}
        >
          {/* home chat window */}
          {pane === ChatSidebarPaneEnum.HOME && <HomeChatWindow />}

          {/* all apps */}
          {pane === ChatSidebarPaneEnum.ALL_APPS && <ChatAllApp />}

          {/* recently used apps chat window */}
          {pane === ChatSidebarPaneEnum.RECENTLY_USED_APPS && <AppChatWindow />}

          {/* setting */}
          {pane === ChatSidebarPaneEnum.SETTING && <ChatSetting />}
        </PageContainer>
      )}

      {datasetCiteData && (
        <PageContainer
          flex={['1 0 0', '0 0 400px']}
          w={['0', '400px']}
          maxW={['100%', '400px']}
          pr={0}
          insertProps={{
            ...rightWindowStyle,
            borderLeft: '1px solid',
            borderLeftColor: 'myGray.200',
            borderRadius: [0, '0 16px 16px 0']
          }}
        >
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
  shouldInitUserInfo: boolean;
  isStandalone?: string;
  showRunningStatus: boolean;
  showSkillReferences: boolean;
  showCite: boolean;
  showFullText: boolean;
  canDownloadSource: boolean;
  showWholeResponse: boolean;
};

const ChatLogin = ({ onSuccess }: { onSuccess: (res: LoginSuccessResponseType) => void }) => {
  const { feConfigs } = useSystemStore();

  return (
    <>
      <NextHead title={feConfigs?.systemTitle}></NextHead>

      <LoginModal onSuccess={onSuccess} />
    </>
  );
};

const ChatContent = (props: ChatPageProps) => {
  const { appId: pageAppId, isStandalone } = props;
  const { appId: storeAppId, chatId } = useChatStore();
  const { setUserInfo } = useUserStore();

  const isInitedUser = useContextSelector(ChatPageContext, (v) => v.isInitedUser);
  const userInfo = useContextSelector(ChatPageContext, (v) => v.userInfo);

  // 优先使用 store 中的 appId：handlePaneChange 会同步写入，比 page props 更早与 chatId 对齐
  const currentAppId = storeAppId || pageAppId;

  const chatHistoryProviderParams = useMemo(
    () => ({ appId: currentAppId, source: ChatSourceEnum.online }),
    [currentAppId]
  );

  const chatRecordProviderParams = useMemo(() => {
    return {
      appId: currentAppId,
      type: GetChatTypeEnum.normal,
      chatId
    };
  }, [currentAppId, chatId]);

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
        <NextHead />
      </PageContainer>
    );
  }

  // Not login
  if (!userInfo) {
    return <ChatLogin onSuccess={loginSuccess} />;
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
      >
        <ChatRecordContextProvider params={chatRecordProviderParams}>
          <Chat />
        </ChatRecordContextProvider>
      </ChatItemContextProvider>
    </ChatContextProvider>
  );
};

const Render = (props: ChatPageProps) => {
  const { feConfigs } = useSystemStore();
  const { userInfo, setUserInfo, initUserInfo } = useUserStore();
  const [isInitedUser, setIsInitedUser] = useState(!props.shouldInitUserInfo);

  const loginSuccess = useCallback(
    async (res: LoginSuccessResponseType) => {
      setUserInfo(res.user);
    },
    [setUserInfo]
  );

  useEffect(() => {
    if (!props.shouldInitUserInfo) return;

    let isUnmounted = false;

    const init = async () => {
      try {
        await initUserInfo();
      } finally {
        if (!isUnmounted) {
          setIsInitedUser(true);
        }
      }
    };

    init();

    return () => {
      isUnmounted = true;
    };
  }, [initUserInfo, props.shouldInitUserInfo]);

  if (!isInitedUser) {
    return (
      <PageContainer isLoading flex={'1'} p={4}>
        <NextHead title={feConfigs?.systemTitle} icon={feConfigs?.favicon} />
      </PageContainer>
    );
  }

  if (!userInfo) {
    return <ChatLogin onSuccess={loginSuccess} />;
  }

  return (
    <ChatPageContextProvider appId={props.appId}>
      <ChatContent {...props} />
    </ChatPageContextProvider>
  );
};

export default Render;

export async function getServerSideProps(context: any) {
  const appId = context?.query?.appId || '';
  const shouldInitUserInfo = !!context.req?.cookies?.fastgpt_token;

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

  return {
    props: {
      appId,
      shouldInitUserInfo,
      showRunningStatus: chatQuoteReaderConfig?.showRunningStatus ?? true,
      showSkillReferences: chatQuoteReaderConfig?.showSkillReferences ?? false,
      showCite: chatQuoteReaderConfig?.showCite ?? true,
      showFullText: chatQuoteReaderConfig?.showFullText ?? true,
      canDownloadSource: chatQuoteReaderConfig?.canDownloadSource ?? true,
      showWholeResponse: chatQuoteReaderConfig?.showWholeResponse ?? true,
      ...(await serviceSideProps(context, ['file', 'app', 'chat', 'workflow', 'login', 'user']))
    }
  };
}
