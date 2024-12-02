import React, { useCallback, useEffect, useMemo } from 'react';
import NextHead from '@/components/common/NextHead';
import { useRouter } from 'next/router';
import { getInitChatInfo } from '@/web/core/chat/api';
import { Box, Flex, Drawer, DrawerOverlay, DrawerContent, useTheme } from '@chakra-ui/react';
import { streamFetch } from '@/web/common/api/fetch';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';

import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import PageContainer from '@/components/PageContainer';
import SideBar from '@/components/SideBar';
import ChatHistorySlider from './components/ChatHistorySlider';
import SliderApps from './components/SliderApps';
import ChatHeader from './components/ChatHeader';
import { useUserStore } from '@/web/support/user/useUserStore';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { getMyApps } from '@/web/core/app/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

import { useMount } from 'ahooks';
import { getNanoid } from '@fastgpt/global/common/string/tools';

import { GetChatTypeEnum } from '@/global/core/chat/constants';
import ChatContextProvider, { ChatContext } from '@/web/core/chat/context/chatContext';
import { AppListItemType } from '@fastgpt/global/core/app/type';
import { useContextSelector } from 'use-context-selector';
import dynamic from 'next/dynamic';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider, {
  ChatRecordContext
} from '@/web/core/chat/context/chatRecordContext';

const CustomPluginRunBox = dynamic(() => import('./components/CustomPluginRunBox'));

const Chat = ({ myApps }: { myApps: AppListItemType[] }) => {
  const router = useRouter();
  const theme = useTheme();
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

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const totalRecordsCount = useContextSelector(ChatRecordContext, (v) => v.totalRecordsCount);

  // Load chat init data
  const { loading } = useRequest2(
    async () => {
      if (!appId || forbidLoadChat.current) return;

      const res = await getInitChatInfo({ appId, chatId });
      res.userAvatar = userInfo?.avatar;

      // Wait for state update to complete
      setChatBoxData(res);

      // reset chat variables
      resetVariables({
        variables: res.variables
      });
    },
    {
      manual: false,
      refreshDeps: [appId, chatId],
      onError(e: any) {
        // reset all chat tore
        if (e?.code === 501) {
          setLastChatAppId('');
          router.replace('/app/list');
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
      // Just send a user prompt
      const histories = messages.slice(-1);
      const { responseText, responseData } = await streamFetch({
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

      // new chat
      onUpdateHistoryTitle({ chatId, newTitle });
      // update chat window
      setChatBoxData((state) => ({
        ...state,
        title: newTitle
      }));

      return { responseText, responseData, isNewChat: forbidLoadChat.current };
    },
    [appId, chatId, onUpdateHistoryTitle, setChatBoxData, forbidLoadChat]
  );
  const RenderHistorySlider = useMemo(() => {
    const Children = (
      <ChatHistorySlider confirmClearText={t('common:core.chat.Confirm to clear history')} />
    );

    return isPc || !appId ? (
      <SideBar>{Children}</SideBar>
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
  }, [appId, isOpenSlider, isPc, onCloseSlider, t]);

  return (
    <Flex h={'100%'}>
      <NextHead title={chatBoxData.app.name} icon={chatBoxData.app.avatar}></NextHead>
      {/* pc show myself apps */}
      {isPc && (
        <Box borderRight={theme.borders.base} w={'220px'} flexShrink={0}>
          <SliderApps apps={myApps} activeAppId={appId} />
        </Box>
      )}

      <PageContainer isLoading={loading} flex={'1 0 0'} w={0} p={[0, '16px']} position={'relative'}>
        <Flex h={'100%'} flexDirection={['column', 'row']}>
          {/* pc always show history. */}
          {RenderHistorySlider}
          {/* chat container */}
          <Flex
            position={'relative'}
            h={[0, '100%']}
            w={['100%', 0]}
            flex={'1 0 0'}
            flexDirection={'column'}
          >
            {/* header */}
            <ChatHeader
              totalRecordsCount={totalRecordsCount}
              apps={myApps}
              history={chatRecords}
              showHistory
              onRouteToAppDetail={() => router.push(`/app/detail?appId=${appId}`)}
            />

            {/* chat box */}
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
                  showRawSource
                  showNodeStatus
                  isReady={!loading}
                />
              )}
            </Box>
          </Flex>
        </Flex>
      </PageContainer>
    </Flex>
  );
};

const Render = (props: { appId: string }) => {
  const { appId } = props;
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { source, chatId, lastChatAppId, setSource, setAppId } = useChatStore();

  const { data: myApps = [], runAsync: loadMyApps } = useRequest2(
    () => getMyApps({ getRecentlyChat: true }),
    {
      manual: false
    }
  );

  // 初始化聊天框
  useMount(async () => {
    // pc: redirect to latest model chat
    if (!appId) {
      const apps = await loadMyApps();
      if (apps.length === 0) {
        toast({
          status: 'error',
          title: t('common:core.chat.You need to a chat app')
        });
        router.replace('/app/list');
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
  });
  // Watch appId
  useEffect(() => {
    setAppId(appId);
  }, [appId, setAppId]);

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

  return source === ChatSourceEnum.online ? (
    <ChatContextProvider params={chatHistoryProviderParams}>
      <ChatItemContextProvider>
        <ChatRecordContextProvider params={chatRecordProviderParams}>
          <Chat myApps={myApps} />
        </ChatRecordContextProvider>
      </ChatItemContextProvider>
    </ChatContextProvider>
  ) : null;
};

export async function getServerSideProps(context: any) {
  return {
    props: {
      appId: context?.query?.appId || '',
      ...(await serviceSideProps(context, ['file', 'app', 'chat', 'workflow']))
    }
  };
}

export default Render;
