import React, { useCallback, useEffect, useMemo, useState } from 'react';
import NextHead from '@/components/common/NextHead';
import { Box, Flex } from '@chakra-ui/react';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import PageContainer from '@/components/PageContainer';
import ChatSlider from '@/pageComponents/chat/slider';
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
import type { LoginSuccessResponseType } from '@fastgpt/global/openapi/support/user/account/login/api';
import type { GetPaginationRecordsBodyType } from '@fastgpt/global/openapi/core/chat/record/api';
import { AUTH_ERROR_EVENT_NAME } from '@/web/common/api/request';
import { clearToken } from '@/web/support/user/auth';
import { resetUserModelCatalogAfterLogin } from '@/web/core/ai/model/useUserModelStore';
import { useRouter } from 'next/router';

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
          pr={datasetCiteData ? 0 : [0, '16px']}
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
            singleQuote={datasetCiteData.singleQuote}
            onClose={() => setCiteModalData(undefined)}
          />
        </PageContainer>
      )}
    </Flex>
  );
};

type ChatPageProps = {
  appId: string;
  isStandalone?: string;
  showRunningStatus?: boolean;
  showSkillReferences?: boolean;
  showCite?: boolean;
  showFullText?: boolean;
  canDownloadSource?: boolean;
  showWholeResponse?: boolean;
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
  const { appId: storeAppId, chatId, source } = useChatStore();
  const { setUserInfo } = useUserStore();

  const isInitedUser = useContextSelector(ChatPageContext, (v) => v.isInitedUser);
  const userInfo = useContextSelector(ChatPageContext, (v) => v.userInfo);

  // 首次入口若还停在 detail/share 等其它 source，以页面入口 appId 为准等待 store 归位；站内切换时 store 会先更新，用 store 保持无感切换。
  const entryAppId = pageAppId;
  const currentAppId =
    source === ChatSourceEnum.online ? storeAppId || entryAppId : entryAppId || storeAppId;
  const currentChatId =
    source === ChatSourceEnum.online && storeAppId === currentAppId ? chatId : '';
  const isChatStoreReady =
    source === ChatSourceEnum.online && (!currentAppId || storeAppId === currentAppId);

  const chatHistoryProviderParams = useMemo(
    () => ({ appId: currentAppId, source: ChatSourceEnum.online }),
    [currentAppId]
  );

  const chatRecordProviderParams = useMemo<GetPaginationRecordsBodyType>(() => {
    return {
      appId: currentAppId,
      type: GetChatTypeEnum.normal,
      chatId: currentChatId
    };
  }, [currentAppId, currentChatId]);
  const loginSuccess = useCallback(
    async (res: LoginSuccessResponseType) => {
      resetUserModelCatalogAfterLogin();
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

  if (!isChatStoreReady) {
    return (
      <PageContainer isLoading flex={'1'} p={4}>
        <NextHead />
      </PageContainer>
    );
  }

  // show main chat interface
  return (
    <ChatContextProvider params={chatHistoryProviderParams}>
      <ChatItemContextProvider
        showRouteToDatasetDetail={isStandalone !== '1'}
        showRunningStatus={props.showRunningStatus ?? true}
        showSkillReferences={props.showSkillReferences ?? false}
        canDownloadSource={props.canDownloadSource ?? true}
        isShowCite={props.showCite ?? true}
        isShowFullText={props.showFullText ?? true}
        showWholeResponse={props.showWholeResponse ?? true}
      >
        <ChatRecordContextProvider params={chatRecordProviderParams}>
          <Chat />
        </ChatRecordContextProvider>
      </ChatItemContextProvider>
    </ChatContextProvider>
  );
};

const Render = () => {
  const router = useRouter();
  const { appId = '', isStandalone } = router.query as {
    appId?: string;
    isStandalone?: string;
  };
  const { feConfigs } = useSystemStore();
  const { userInfo, setUserInfo, initUserInfo } = useUserStore();
  const [isInitedUser, setIsInitedUser] = useState(!!userInfo);

  const loginSuccess = useCallback(
    async (res: LoginSuccessResponseType) => {
      resetUserModelCatalogAfterLogin();
      setUserInfo(res.user);
    },
    [setUserInfo]
  );

  useEffect(() => {
    const handleAuthError = () => {
      // 全局拦截器已豁免 /chat 跳转；这里同步页面态，触发本页 LoginModal。
      setUserInfo(null);
      void clearToken();
    };

    window.addEventListener(AUTH_ERROR_EVENT_NAME, handleAuthError);
    return () => {
      window.removeEventListener(AUTH_ERROR_EVENT_NAME, handleAuthError);
    };
  }, [setUserInfo]);

  useEffect(() => {
    if (userInfo) return;

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
  }, [initUserInfo, userInfo]);

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
    <ChatPageContextProvider appId={appId}>
      <ChatContent appId={appId} isStandalone={isStandalone} />
    </ChatPageContextProvider>
  );
};

export default Render;
