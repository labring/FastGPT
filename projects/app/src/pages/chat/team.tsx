import React, { useCallback, useEffect, useMemo, useState } from 'react';
import NextHead from '@/components/common/NextHead';
import { getTeamChatInfo } from '@/web/core/chat/api';
import { useRouter } from 'next/router';
import { Box, Flex, Drawer, DrawerOverlay, DrawerContent, useTheme } from '@chakra-ui/react';
import SideBar from '@/components/SideBar';
import PageContainer from '@/components/PageContainer';
import { getMyTokensApps } from '@/web/core/chat/api';
import ChatHistorySlider from './components/ChatHistorySlider';
import ChatHeader from './components/ChatHeader';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useTranslation } from 'next-i18next';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import { streamFetch } from '@/web/common/api/fetch';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import SliderApps from './components/SliderApps';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import ChatContextProvider, { ChatContext } from '@/web/core/chat/context/chatContext';
import { AppListItemType } from '@fastgpt/global/core/app/type';
import { useContextSelector } from 'use-context-selector';
import { InitChatResponse } from '@/global/core/chat/api';
import { defaultChatData, GetChatTypeEnum } from '@/global/core/chat/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';

import dynamic from 'next/dynamic';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider, {
  ChatRecordContext
} from '@/web/core/chat/context/chatRecordContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useMount } from 'ahooks';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
const CustomPluginRunBox = dynamic(() => import('./components/CustomPluginRunBox'));

type Props = { appId: string; chatId: string; teamId: string; teamToken: string };

const Chat = ({ myApps }: { myApps: AppListItemType[] }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    teamId = '',
    appId: appIdQuery = '',
    teamToken,
    ...customVariables
  } = router.query as Props & {
    [key: string]: string;
  };

  const theme = useTheme();
  const { isPc } = useSystem();

  const { outLinkAuthData, appId, chatId } = useChatStore();

  const isOpenSlider = useContextSelector(ChatContext, (v) => v.isOpenSlider);
  const onCloseSlider = useContextSelector(ChatContext, (v) => v.onCloseSlider);
  const forbidLoadChat = useContextSelector(ChatContext, (v) => v.forbidLoadChat);
  const onChangeChatId = useContextSelector(ChatContext, (v) => v.onChangeChatId);
  const onUpdateHistoryTitle = useContextSelector(ChatContext, (v) => v.onUpdateHistoryTitle);

  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);
  const chatBoxData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const totalRecordsCount = useContextSelector(ChatRecordContext, (v) => v.totalRecordsCount);

  // get chat app info
  const { loading } = useRequest2(
    async () => {
      if (!appId || forbidLoadChat.current) return;

      const res = await getTeamChatInfo({ teamId, appId, chatId, teamToken });

      setChatBoxData(res);

      // reset chat records
      resetVariables({
        variables: res.variables
      });
    },
    {
      manual: false,
      refreshDeps: [teamId, teamToken, appId, chatId],
      onError(e: any) {
        console.log(e);
        if (chatId) {
          onChangeChatId();
        }
      },
      onFinally() {
        forbidLoadChat.current = false;
      }
    }
  );

  const startChat = useCallback(
    async ({
      messages,
      controller,
      generatingMessage,
      variables,
      responseChatItemId
    }: StartChatFnProps) => {
      const completionChatId = chatId || getNanoid();
      // Just send a user prompt
      const histories = messages.slice(-1);

      const { responseText, responseData } = await streamFetch({
        data: {
          messages: histories,
          variables: {
            ...variables,
            ...customVariables
          },
          responseChatItemId,
          appId,
          teamId,
          teamToken,
          chatId: completionChatId,
          appType: chatBoxData.app.type
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      const newTitle = getChatTitleFromChatMessage(GPTMessages2Chats(histories)[0]);

      // new chat
      if (completionChatId !== chatId) {
        onChangeChatId(completionChatId, true);
      }
      onUpdateHistoryTitle({ chatId: completionChatId, newTitle });

      // update chat window
      setChatBoxData((state) => ({
        ...state,
        title: newTitle
      }));

      return { responseText, responseData, isNewChat: forbidLoadChat.current };
    },
    [
      chatId,
      customVariables,
      appId,
      teamId,
      teamToken,
      chatBoxData.app.type,
      onUpdateHistoryTitle,
      setChatBoxData,
      forbidLoadChat,
      onChangeChatId
    ]
  );

  const RenderHistoryList = useMemo(() => {
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
        <Flex h={'100%'} flexDirection={['column', 'row']} bg={'white'}>
          {RenderHistoryList}
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
            />
            {/* chat box */}
            <Box flex={1}>
              {chatBoxData.app.type === AppTypeEnum.plugin ? (
                <CustomPluginRunBox
                  appId={appId}
                  chatId={chatId}
                  outLinkAuthData={outLinkAuthData}
                  onNewChat={() => onChangeChatId(getNanoid())}
                  onStartChat={startChat}
                />
              ) : (
                <ChatBox
                  isReady={!loading}
                  appId={appId}
                  chatId={chatId}
                  outLinkAuthData={outLinkAuthData}
                  feedbackType={'user'}
                  onStartChat={startChat}
                  chatType="team"
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
  const { teamId, appId, teamToken } = props;
  const router = useRouter();
  const { source, chatId, setSource, setAppId, setOutLinkAuthData } = useChatStore();

  const { data: myApps = [], runAsync: loadMyApps } = useRequest2(
    async () => {
      if (teamId && teamToken) {
        return getMyTokensApps({ teamId, teamToken });
      }
      return [];
    },
    {
      manual: true
    }
  );

  // 初始化聊天框
  useMount(async () => {
    setSource('team');

    const apps = await loadMyApps();

    if (appId || apps.length === 0) return;

    router.replace({
      query: {
        ...router.query,
        appId: apps[0]._id
      }
    });
  });
  // Watch appId
  useEffect(() => {
    setAppId(appId);
  }, [appId, setAppId]);
  useEffect(() => {
    setOutLinkAuthData({
      teamId,
      teamToken
    });
    return () => {
      setOutLinkAuthData({});
    };
  }, [teamId, teamToken, setOutLinkAuthData]);

  const contextParams = useMemo(() => {
    return { teamId, appId, teamToken };
  }, [teamId, appId, teamToken]);
  const chatRecordProviderParams = useMemo(() => {
    return {
      appId,
      chatId,
      teamId,
      teamToken,
      type: GetChatTypeEnum.team
    };
  }, [appId, chatId, teamId, teamToken]);

  return source === ChatSourceEnum.team ? (
    <ChatContextProvider params={contextParams}>
      <ChatItemContextProvider>
        <ChatRecordContextProvider params={chatRecordProviderParams}>
          <Chat {...props} myApps={myApps} />
        </ChatRecordContextProvider>
      </ChatItemContextProvider>
    </ChatContextProvider>
  ) : null;
};

export async function getServerSideProps(context: any) {
  return {
    props: {
      appId: context?.query?.appId || '',
      chatId: context?.query?.chatId || '',
      teamId: context?.query?.teamId || '',
      teamToken: context?.query?.teamToken || '',
      ...(await serviceSideProps(context, ['file', 'app', 'chat', 'workflow']))
    }
  };
}

export default Render;
