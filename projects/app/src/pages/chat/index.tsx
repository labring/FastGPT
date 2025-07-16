import React, { useCallback, useEffect, useMemo, useState } from 'react';
import NextHead from '@/components/common/NextHead';
import { useRouter } from 'next/router';
import { getInitChatInfo } from '@/web/core/chat/api';
import { Box, Flex, Drawer, DrawerOverlay, DrawerContent, Text } from '@chakra-ui/react';
import { streamFetch } from '@/web/common/api/fetch';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
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
import LoginModal from '@/components/support/user/LoginModal';

const CustomPluginRunBox = dynamic(() => import('@/pageComponents/chat/CustomPluginRunBox'));

const Chat = ({
  myApps,
  isLoadingApps
}: {
  myApps: AppListItemType[];
  isLoadingApps?: boolean;
}) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { isPc } = useSystem();

  const { userInfo } = useUserStore();
  const { setLastChatAppId, chatId, appId, outLinkAuthData } = useChatStore();

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
      onError(e: any) {
        if (e?.code === 501) {
          setLastChatAppId('');
          router.replace('/dashboard/apps');
        } else {
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
        <Box flexShrink={0} w="202px">
          <SliderApps apps={myApps} activeAppId={appId} isLoading={isLoadingApps} />
        </Box>
      )}

      {(!datasetCiteData || isPc) && (
        <PageContainer flex={'1 0 0'} w={0} position={'relative'}>
          <Flex h={'100%'} flexDirection={['column', 'row']}>
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
                    chatType={'chat'}
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

const Render = (props: { appId: string; isStandalone?: string; ChineseRedirectUrl?: string }) => {
  const { appId, isStandalone, ChineseRedirectUrl } = props;
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { source, chatId, lastChatAppId, setSource, setAppId } = useChatStore();
  const { userInfo, initUserInfo } = useUserStore();

  const [hasTriggeredInit, setHasTriggeredInit] = useState(false);
  const [isInitializingUser, setIsInitializingUser] = useState(true);

  const isLoggedIn = useMemo(() => !!userInfo, [userInfo]);
  const isLoginModalOpen = !isLoggedIn && !isInitializingUser; // 只有没登录且没初始化用户信息的时候才展示登录弹窗

  useMount(async () => {
    try {
      await initUserInfo();
    } catch (error) {
      console.log('User not logged in:', error);
    } finally {
      setIsInitializingUser(false);
    }
  });

  const {
    data: myApps = [],
    runAsync: loadMyApps,
    loading: isLoadingApps
  } = useRequest2(() => getMyApps({ getRecentlyChat: true }), {
    manual: true, // 手动控制加载时机
    refreshDeps: [isLoggedIn, isInitializingUser] // 当登录状态变化时刷新
  });

  // 在用户初始化完成且已登录时加载应用列表
  useEffect(() => {
    if (!isInitializingUser && isLoggedIn) {
      loadMyApps();
    }
  }, [isInitializingUser, isLoggedIn, loadMyApps]);

  const handleLoginSuccess = useCallback(async () => {
    const apps = await loadMyApps();

    if (!appId && apps.length > 0) {
      await router.replace({
        query: {
          ...router.query,
          appId: lastChatAppId || apps[0]._id
        }
      });
    }

    setSource('online');
  }, [loadMyApps, appId, lastChatAppId, router, setSource]);

  useEffect(() => {
    if (isInitializingUser || !isLoggedIn) {
      return;
    }

    const initChat = async () => {
      if (!appId) {
        const apps = await loadMyApps();
        if (apps.length === 0) {
          toast({
            status: 'error',
            title: t('common:core.chat.You need to a chat app')
          });
          router.replace('/dashboard/apps');
        } else {
          router.replace({
            query: {
              ...router.query,
              appId: lastChatAppId || apps[0]._id
            }
          });
        }
      }
      setSource('online');
    };

    initChat();
  }, [
    isInitializingUser,
    isLoggedIn,
    appId,
    lastChatAppId,
    loadMyApps,
    router,
    setSource,
    t,
    toast
  ]);

  useEffect(() => {
    if (!isLoggedIn) {
      setHasTriggeredInit(false); // 登出的时候就重置初始化触发状态
    } else {
      // 如果没有 appId 并且没有触发过初始化，就触发初始化
      if (!appId && !hasTriggeredInit) {
        setHasTriggeredInit(true);
        handleLoginSuccess();
      }
    }
  }, [isLoggedIn, appId, hasTriggeredInit, handleLoginSuccess]);

  // Watch appId
  useEffect(() => {
    if (isLoggedIn) {
      setAppId(appId);
    }
  }, [appId, setAppId, isLoggedIn]);

  const currentApp = useMemo(() => {
    return myApps.find((app) => app._id === appId);
  }, [appId, myApps]);

  const chatHistoryProviderParams = useMemo(
    () => ({ appId, source: ChatSourceEnum.online }),
    [appId]
  );
  const chatRecordProviderParams = useMemo(() => {
    return {
      appId,
      type: GetChatTypeEnum.normal,
      chatId: chatId
    };
  }, [appId, chatId]);

  if (isInitializingUser) {
    return (
      <PageContainer flex={'1'} p={4}>
        <Box display="flex" justifyContent="center" alignItems="center" h="100%">
          <Text>{t('common:Loading')}</Text>
        </Box>
      </PageContainer>
    );
  }

  if (!isLoggedIn) {
    return (
      <>
        <PageContainer flex={'1'} p={4}>
          {/* TODO: 因为没登录所以展示空页面，后续可能有 UI 上的调整 */}
        </PageContainer>
        <LoginModal
          isOpen={isLoginModalOpen}
          onSuccess={handleLoginSuccess}
          ChineseRedirectUrl={ChineseRedirectUrl}
        />
      </>
    );
  }

  return (
    <>
      {source === ChatSourceEnum.online ? (
        <ChatContextProvider params={chatHistoryProviderParams}>
          <ChatItemContextProvider
            showRouteToAppDetail={isStandalone !== '1' && !!currentApp?.permission.hasWritePer}
            showRouteToDatasetDetail={isStandalone !== '1'}
            isShowReadRawSource={true}
            isResponseDetail={true}
            // isShowFullText={true}
            showNodeStatus
          >
            <ChatRecordContextProvider params={chatRecordProviderParams}>
              <Chat myApps={myApps} isLoadingApps={isLoadingApps} />
            </ChatRecordContextProvider>
          </ChatItemContextProvider>
        </ChatContextProvider>
      ) : null}

      <LoginModal
        isOpen={isLoginModalOpen}
        onSuccess={handleLoginSuccess}
        ChineseRedirectUrl={ChineseRedirectUrl}
      />
    </>
  );
};

export async function getServerSideProps(context: any) {
  return {
    props: {
      appId: context?.query?.appId || '',
      isStandalone: context?.query?.isStandalone || '',
      ChineseRedirectUrl: process.env.CHINESE_IP_REDIRECT_URL ?? '',
      ...(await serviceSideProps(context, ['file', 'app', 'chat', 'workflow', 'login', 'account']))
    }
  };
}

export default Render;
