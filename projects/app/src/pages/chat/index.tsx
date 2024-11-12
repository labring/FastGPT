import React, { useCallback, useMemo, useState } from 'react';
import NextHead from '@/components/common/NextHead';
import { useRouter } from 'next/router';
import { delChatRecordById, getInitChatInfo } from '@/web/core/chat/api';
import { Box, Flex, Drawer, DrawerOverlay, DrawerContent, useTheme } from '@chakra-ui/react';
import { streamFetch } from '@/web/common/api/fetch';
import { useChatStore } from '@/web/core/chat/context/storeChat';
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

import { useCreation, useMount } from 'ahooks';
import { getNanoid } from '@fastgpt/global/common/string/tools';

import { defaultChatData, GetChatTypeEnum } from '@/global/core/chat/constants';
import ChatContextProvider, { ChatContext } from '@/web/core/chat/context/chatContext';
import { AppListItemType } from '@fastgpt/global/core/app/type';
import { useContextSelector } from 'use-context-selector';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import dynamic from 'next/dynamic';
import { useChat } from '@/components/core/chat/ChatContainer/useChat';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { InitChatResponse } from '@/global/core/chat/api';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';

const CustomPluginRunBox = dynamic(() => import('./components/CustomPluginRunBox'));

type Props = { appId: string; chatId: string };

const Chat = ({
  appId,
  chatId,
  myApps
}: Props & {
  myApps: AppListItemType[];
}) => {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { isPc } = useSystem();
  const { setLastChatAppId } = useChatStore();

  const {
    onUpdateHistory,
    onClearHistories,
    onDelHistory,
    isOpenSlider,
    onCloseSlider,
    forbidLoadChat,
    onChangeChatId,
    onUpdateHistoryTitle
  } = useContextSelector(ChatContext, (v) => v);

  const params = useCreation(() => {
    return {
      chatId,
      appId,
      type: GetChatTypeEnum.normal
    };
  }, [appId, chatId]);
  const {
    ChatBoxRef,
    variablesForm,
    pluginRunTab,
    setPluginRunTab,
    resetVariables,
    chatRecords,
    ScrollData,
    setChatRecords,
    totalRecordsCount
  } = useChat(params);

  // get chat app info
  const [chatData, setChatData] = useState<InitChatResponse>(defaultChatData);
  const isPlugin = chatData.app.type === AppTypeEnum.plugin;

  // Load chat init data
  const { loading: isLoading } = useRequest2(
    async () => {
      if (!appId || forbidLoadChat.current) return;

      const res = await getInitChatInfo({ appId, chatId });

      setChatData(res);
      // reset chat variables
      resetVariables({
        variables: res.variables
      });

      setLastChatAppId(appId);
    },
    {
      manual: false,
      refreshDeps: [appId, chatId],
      onError(e: any) {
        setLastChatAppId('');

        // reset all chat tore
        if (e?.code === 501) {
          router.replace('/app/list');
        } else {
          router.replace({
            query: {
              ...router.query,
              appId: myApps[0]?._id,
              chatId: ''
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
      const completionChatId = chatId || getNanoid();
      // Just send a user prompt
      const histories = messages.slice(-1);
      const { responseText, responseData } = await streamFetch({
        data: {
          messages: histories,
          variables,
          responseChatItemId,
          appId,
          chatId: completionChatId
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      const newTitle = getChatTitleFromChatMessage(GPTMessages2Chats(histories)[0]);

      // new chat
      if (completionChatId !== chatId && controller.signal.reason !== 'leave') {
        onChangeChatId(completionChatId, true);
      }
      onUpdateHistoryTitle({ chatId: completionChatId, newTitle });
      // update chat window
      setChatData((state) => ({
        ...state,
        title: newTitle
      }));

      return { responseText, responseData, isNewChat: forbidLoadChat.current };
    },
    [chatId, appId, onUpdateHistoryTitle, forbidLoadChat, onChangeChatId]
  );
  const loading = isLoading;

  const RenderHistorySlider = useMemo(() => {
    const Children = (
      <ChatHistorySlider
        confirmClearText={t('common:core.chat.Confirm to clear history')}
        appId={appId}
        appName={chatData.app.name}
        appAvatar={chatData.app.avatar}
        onDelHistory={(e) => onDelHistory({ ...e, appId })}
        onClearHistory={() => {
          onClearHistories({ appId });
        }}
        onSetHistoryTop={(e) => {
          onUpdateHistory({ ...e, appId });
        }}
        onSetCustomTitle={async (e) => {
          onUpdateHistory({
            appId,
            chatId: e.chatId,
            customTitle: e.title
          });
        }}
      />
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
  }, [
    appId,
    chatData.app.avatar,
    chatData.app.name,
    isOpenSlider,
    isPc,
    onClearHistories,
    onCloseSlider,
    onDelHistory,
    onUpdateHistory,
    t
  ]);

  return (
    <Flex h={'100%'}>
      <NextHead title={chatData.app.name} icon={chatData.app.avatar}></NextHead>
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
              chatData={chatData}
              history={chatRecords}
              showHistory
              onRouteToAppDetail={() => router.push(`/app/detail?appId=${appId}`)}
            />

            {/* chat box */}
            <Box flex={'1 0 0'} bg={'white'}>
              {isPlugin ? (
                <CustomPluginRunBox
                  pluginInputs={chatData.app.pluginInputs}
                  variablesForm={variablesForm}
                  histories={chatRecords}
                  setHistories={setChatRecords}
                  appId={chatData.appId}
                  chatConfig={chatData.app.chatConfig}
                  tab={pluginRunTab}
                  setTab={setPluginRunTab}
                  onNewChat={() => onChangeChatId(getNanoid())}
                  onStartChat={onStartChat}
                />
              ) : (
                <ChatBox
                  ScrollData={ScrollData}
                  ref={ChatBoxRef}
                  chatHistories={chatRecords}
                  setChatHistories={setChatRecords}
                  variablesForm={variablesForm}
                  showEmptyIntro
                  appAvatar={chatData.app.avatar}
                  userAvatar={userInfo?.avatar}
                  chatConfig={chatData.app?.chatConfig}
                  feedbackType={'user'}
                  onStartChat={onStartChat}
                  onDelMessage={({ contentId }) => delChatRecordById({ contentId, appId, chatId })}
                  appId={appId}
                  chatId={chatId}
                  chatType={'chat'}
                  showRawSource
                  showNodeStatus
                />
              )}
            </Box>
          </Flex>
        </Flex>
      </PageContainer>
    </Flex>
  );
};

const Render = (props: Props) => {
  const { appId } = props;
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();

  const { lastChatAppId, lastChatId } = useChatStore();

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
      if (lastChatAppId) {
        return router.replace({
          query: {
            ...router.query,
            appId: lastChatAppId,
            chatId: lastChatId
          }
        });
      }

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
            appId: apps[0]._id,
            chatId: ''
          }
        });
      }
    }
  });

  const providerParams = useMemo(() => ({ appId, source: ChatSourceEnum.online }), [appId]);
  return (
    <ChatContextProvider params={providerParams}>
      <Chat {...props} myApps={myApps} />
    </ChatContextProvider>
  );
};

export async function getServerSideProps(context: any) {
  return {
    props: {
      appId: context?.query?.appId || '',
      chatId: context?.query?.chatId || '',
      ...(await serviceSideProps(context, ['file', 'app', 'chat', 'workflow']))
    }
  };
}

export default Render;
