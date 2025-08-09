import React, { useCallback, useEffect, useMemo, useState } from 'react';
import NextHead from '@/components/common/NextHead';
import { getChatSetting } from '@/web/core/chat/api';
import { Box, Flex } from '@chakra-ui/react';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import PageContainer from '@/components/PageContainer';
import SliderApps from '@/pageComponents/chat/SliderApps';
import { serviceSideProps } from '@/web/common/i18n/utils';
import {
  ChatSidebarPaneEnum,
  defaultCollapseStatus,
  type CollapseStatusType
} from '@/web/components/chat/constants';
import { GetChatTypeEnum } from '@/global/core/chat/constants';
import ChatContextProvider from '@/web/core/chat/context/chatContext';
import { type AppListItemType } from '@fastgpt/global/core/app/type';
import { useContextSelector } from 'use-context-selector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useRouter } from 'next/router';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import LoginModal from '@/pageComponents/login/LoginModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ChatSetting from '@/components/core/chat/ChatSetting';
import { useChat } from '@/web/hooks/chat/useChat';
import type { ChatSettingSchema } from '@fastgpt/global/core/chat/setting/type';
import AppChatWindow from '@/components/core/chat/ChatWindow/AppChatWindow';
import HomeChatWindow from '@/components/core/chat/ChatWindow/HomeChatWindow';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

const Chat = ({ myApps }: { myApps: AppListItemType[] }) => {
  const { isPc } = useSystem();
  const router = useRouter();

  const { appId, lastPane, setLastPane, hiddenAppId, setHiddenAppId } = useChatStore();
  const { feConfigs } = useSystemStore();

  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  const [collapse, setCollapse] = useState<CollapseStatusType>(defaultCollapseStatus);
  const [pane, setPane] = useState<ChatSidebarPaneEnum>(
    !!feConfigs.isPlus
      ? lastPane || ChatSidebarPaneEnum.HOME
      : ChatSidebarPaneEnum.RECENTLY_USED_APPS
  );

  const { data: chatSettings, runAsync: refreshChatSetting } = useRequest2<
    ChatSettingSchema | null,
    []
  >(
    async () => {
      if (!feConfigs.isPlus) return null;
      const settings = await getChatSetting();
      if (settings?.appId && settings.appId !== hiddenAppId) {
        setHiddenAppId(settings.appId);
      }
      return settings;
    },
    {
      manual: false,
      refreshDeps: [feConfigs.isPlus]
    }
  );
  const logos: Pick<ChatSettingSchema, 'wideLogoUrl' | 'squareLogoUrl'> = {
    wideLogoUrl: chatSettings?.wideLogoUrl || undefined,
    squareLogoUrl: chatSettings?.squareLogoUrl || undefined
  };

  // 处理 pane 切换
  const handlePaneChange = useCallback(
    (newPane: ChatSidebarPaneEnum) => {
      setPane(newPane);
      setLastPane(newPane);

      // 如果切换到首页，且当前不是隐藏应用，则切换到隐藏应用
      if (newPane === ChatSidebarPaneEnum.HOME && hiddenAppId && appId !== hiddenAppId) {
        router.replace({
          pathname: router.pathname,
          query: {
            ...router.query,
            appId: hiddenAppId
          }
        });
      }
    },
    [setLastPane, hiddenAppId, appId, router]
  );

  return (
    <Flex h={'100%'}>
      {/* Side bar */}
      {isPc && (
        <Box
          flexGrow={0}
          flexShrink={0}
          w={collapse ? '72px' : '202px'}
          overflow={'hidden'}
          transition={'width 0.1s ease-in-out'}
        >
          <SliderApps
            pane={pane}
            logos={logos}
            apps={myApps}
            activeAppId={appId}
            collapse={collapse}
            onCollapse={setCollapse}
            onPaneChange={handlePaneChange}
          />
        </Box>
      )}

      {(!datasetCiteData || isPc) && (
        <PageContainer flex="1 0 0" w={0} position="relative">
          {/* home chat window */}
          {pane === ChatSidebarPaneEnum.HOME && <HomeChatWindow settings={chatSettings ?? null} />}

          {/* recently used apps chat window */}
          {pane === ChatSidebarPaneEnum.RECENTLY_USED_APPS && <AppChatWindow myApps={myApps} />}

          {/* setting */}
          {pane === ChatSidebarPaneEnum.SETTING && (
            <ChatSetting settings={chatSettings ?? null} onSettingsRefresh={refreshChatSetting} />
          )}
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
  const { isPc } = useSystem();
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

        <Box
          h="full"
          bg={`url(${getWebReqUrl('/icon/login-bg.svg')}) no-repeat`}
          bgSize={'cover'}
          bgPosition={'center'}
        />

        <LoginModal />
      </>
    );
  }

  // show main chat interface
  return (
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
