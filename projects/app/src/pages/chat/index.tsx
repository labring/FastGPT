import React, { useCallback, useEffect, useMemo, useState } from 'react';
import NextHead from '@/components/common/NextHead';
import { useRouter } from 'next/router';
import { getInitChatInfo } from '@/web/core/chat/api';
import { Box, Flex, Drawer, DrawerOverlay, DrawerContent } from '@chakra-ui/react';
import { streamFetch } from '@/web/common/api/fetch';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useTranslation } from 'next-i18next';

import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import PageContainer from '@/components/PageContainer';
import SideBar from '@/components/SideBar';
import ChatHistorySlider from '@/pageComponents/chat/ChatHistorySlider';
import SliderApps from '@/pageComponents/chat/SliderApps';
import ChatHeader from '@/pageComponents/chat/ChatHeader';
import { useUserStore } from '@/web/support/user/useUserStore';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { getMyApps } from '@/web/core/app/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

import { useMount } from 'ahooks';
import { getNanoid } from '@fastgpt/global/common/string/tools';

import { GetChatTypeEnum } from '@/global/core/chat/constants';
import ChatContextProvider, { ChatContext } from '@/web/core/chat/context/chatContext';
import { type AppListItemType } from '@fastgpt/global/core/app/type';
import { useContextSelector } from 'use-context-selector';
import dynamic from 'next/dynamic';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider, {
  ChatRecordContext
} from '@/web/core/chat/context/chatRecordContext';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import LoginModal from '@/pageComponents/login/LoginModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useToast } from '@fastgpt/web/hooks/useToast';

const CustomPluginRunBox = dynamic(() => import('@/pageComponents/chat/CustomPluginRunBox'));

// custom hook for managing chat page state and initialization logic
const useChatHook = (appId: string) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { lastChatAppId, setSource, setAppId } = useChatStore();
  const { userInfo, initUserInfo } = useUserStore();

  const [isInitedUser, setIsIntedUser] = useState(false);

  // get app list
  const { data: myApps = [] } = useRequest2(() => getMyApps({ getRecentlyChat: true }), {
    manual: false,
    refreshDeps: [userInfo],
    errorToast: '',
    pollingInterval: 30000,
    async onSuccess(apps) {
      // if no appId and there are available apps, automatically jump to the first app
      if (!appId && apps.length > 0) {
        router.replace({
          query: {
            ...router.query,
            appId: lastChatAppId || apps[0]._id
          }
        });
      }
      if (apps.length === 0) {
        toast({
          status: 'warning',
          title: t('chat:no_invalid_app')
        });
      }
    }
  });

  // initialize user info
  useMount(async () => {
    try {
      await initUserInfo();
    } catch (error) {
      console.log('User not logged in:', error);
    } finally {
      setSource('online');
      setIsIntedUser(true);
    }
  });

  // watch appId
  useEffect(() => {
    if (userInfo && appId) {
      setAppId(appId);
    }
  }, [appId, setAppId, userInfo]);

  return {
    isInitedUser,
    userInfo,
    myApps
  };
};

const Chat = ({ myApps }: { myApps: AppListItemType[] }) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { isPc } = useSystem();

  const { userInfo } = useUserStore();
  const { chatId, appId, outLinkAuthData } = useChatStore();

  const isOpenSlider = useContextSelector(ChatContext, (v) => v.isOpenSlider);
  const onCloseSlider = useContextSelector(ChatContext, (v) => v.onCloseSlider);
  const forbidLoadChat = useContextSelector(ChatContext, (v) => v.forbidLoadChat);
  const onChangeChatId = useContextSelector(ChatContext, (v) => v.onChangeChatId);
  const onUpdateHistoryTitle = useContextSelector(ChatContext, (v) => v.onUpdateHistoryTitle);

  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);
  const isPlugin = useContextSelector(ChatItemContext, (v) => v.isPlugin);
  const chatBoxData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const totalRecordsCount = useContextSelector(ChatRecordContext, (v) => v.totalRecordsCount);

  const { loading } = useRequest2(
    async () => {
      if (!appId || forbidLoadChat.current) return;

      const res = await getInitChatInfo({ appId, chatId });
      res.userAvatar = userInfo?.avatar;

      setChatBoxData(res);

      resetVariables({
        variables: res.variables,
        variableList: res.app?.chatConfig?.variables
      });
    },
    {
      manual: false,
      refreshDeps: [appId, chatId],
      errorToast: '',
      onError(e: any) {
        if (e?.code && e.code >= 502000) {
          router.replace({
            query: {
              ...router.query,
              appId: myApps[0]?._id
            }
          });
        }
      },
      onFinally() {
        forbidLoadChat.current = false;
      }
    }
  );

  const onStartChat = useCallback(
    async ({
      messages,
      responseChatItemId,
      controller,
      generatingMessage,
      variables
    }: StartChatFnProps) => {
      const histories = messages.slice(-1);
      const { responseText } = await streamFetch({
        data: {
          messages: histories,
          variables,
          responseChatItemId,
          appId,
          chatId
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      const newTitle = getChatTitleFromChatMessage(GPTMessages2Chats(histories)[0]);

      onUpdateHistoryTitle({ chatId, newTitle });
      setChatBoxData((state) => ({
        ...state,
        title: newTitle
      }));

      return { responseText, isNewChat: forbidLoadChat.current };
    },
    [appId, chatId, onUpdateHistoryTitle, setChatBoxData, forbidLoadChat]
  );

  const RenderHistorySlider = useMemo(() => {
    const Children = (
      <ChatHistorySlider confirmClearText={t('common:core.chat.Confirm to clear history')} />
    );

    return isPc || !appId ? (
      <SideBar externalTrigger={!!datasetCiteData}>{Children}</SideBar>
    ) : (
      <Drawer
        isOpen={isOpenSlider}
        placement="left"
        autoFocus={false}
        size={'xs'}
        onClose={onCloseSlider}
      >
        <DrawerOverlay backgroundColor={'rgba(255,255,255,0.5)'} />
        <DrawerContent maxWidth={'75vw'}>{Children}</DrawerContent>
      </Drawer>
    );
  }, [t, isPc, appId, isOpenSlider, onCloseSlider, datasetCiteData]);

  return (
    <Flex h={'100%'}>
      <NextHead title={chatBoxData.app.name} icon={chatBoxData.app.avatar}></NextHead>
      {isPc && (
        <Box flex={'0 0 202px'} overflow={'hidden'}>
          <SliderApps apps={myApps} activeAppId={appId} />
        </Box>
      )}

      {(!datasetCiteData || isPc) && (
        <PageContainer flex={'1 0 0'} w={0} position={'relative'}>
          <Flex h={'100%'} flexDirection={['column', 'row']}>
            {/* pc always show history */}
            {RenderHistorySlider}
            <Flex
              position={'relative'}
              h={[0, '100%']}
              w={['100%', 0]}
              flex={'1 0 0'}
              flexDirection={'column'}
            >
              <ChatHeader
                totalRecordsCount={totalRecordsCount}
                apps={myApps}
                history={chatRecords}
                showHistory
              />

              <Box flex={'1 0 0'} bg={'white'}>
                {isPlugin ? (
                  <CustomPluginRunBox
                    appId={appId}
                    chatId={chatId}
                    outLinkAuthData={outLinkAuthData}
                    onNewChat={() => onChangeChatId(getNanoid())}
                    onStartChat={onStartChat}
                  />
                ) : (
                  <ChatBox
                    appId={appId}
                    chatId={chatId}
                    outLinkAuthData={outLinkAuthData}
                    showEmptyIntro
                    feedbackType={'user'}
                    onStartChat={onStartChat}
                    chatType={ChatTypeEnum.chat}
                    isReady={!loading}
                  />
                )}
              </Box>
            </Flex>
          </Flex>
        </PageContainer>
      )}

      {datasetCiteData && (
        <PageContainer flex={'1 0 0'} w={0} maxW={'560px'}>
          <ChatQuoteList
            rawSearch={datasetCiteData.rawSearch}
            metadata={datasetCiteData.metadata}
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
  const { isInitedUser, userInfo, myApps } = useChatHook(appId);

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
        <PageContainer flex={'1'} p={4}></PageContainer>
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
