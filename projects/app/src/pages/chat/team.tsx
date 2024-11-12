import React, { useCallback, useEffect, useMemo, useState } from 'react';
import NextHead from '@/components/common/NextHead';
import { delChatRecordById, getTeamChatInfo } from '@/web/core/chat/api';
import { useRouter } from 'next/router';
import { Box, Flex, Drawer, DrawerOverlay, DrawerContent, useTheme } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
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
import { useChat } from '@/components/core/chat/ChatContainer/useChat';

import dynamic from 'next/dynamic';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
const CustomPluginRunBox = dynamic(() => import('./components/CustomPluginRunBox'));

type Props = { appId: string; chatId: string; teamId: string; teamToken: string };

const Chat = ({ myApps }: { myApps: AppListItemType[] }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    teamId = '',
    appId = '',
    chatId = '',
    teamToken,
    ...customVariables
  } = router.query as Props & {
    [key: string]: string;
  };

  const { toast } = useToast();
  const theme = useTheme();
  const { isPc } = useSystem();

  const [chatData, setChatData] = useState<InitChatResponse>(defaultChatData);

  const {
    onUpdateHistoryTitle,
    onUpdateHistory,
    onClearHistories,
    onDelHistory,
    isOpenSlider,
    onCloseSlider,
    forbidLoadChat,
    onChangeChatId
  } = useContextSelector(ChatContext, (v) => v);

  const params = useMemo(() => {
    return {
      appId,
      chatId,
      teamId,
      teamToken,
      type: GetChatTypeEnum.team
    };
  }, [appId, chatId, teamId, teamToken]);
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
          appType: chatData.app.type
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
      setChatData((state) => ({
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
      chatData.app.type,
      onUpdateHistoryTitle,
      forbidLoadChat,
      onChangeChatId
    ]
  );

  // get chat app info
  const { loading: isLoading } = useRequest2(
    async () => {
      if (!appId || forbidLoadChat.current) return;

      const res = await getTeamChatInfo({ teamId, appId, chatId, teamToken });
      setChatData(res);

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
          onChangeChatId('');
        }
      },
      onFinally() {
        forbidLoadChat.current = false;
      }
    }
  );

  const RenderHistoryList = useMemo(() => {
    const Children = (
      <ChatHistorySlider
        appId={appId}
        appName={chatData.app.name}
        appAvatar={chatData.app.avatar}
        confirmClearText={t('common:core.chat.Confirm to clear history')}
        onDelHistory={(e) => onDelHistory({ ...e, appId, teamId, teamToken })}
        onClearHistory={() => {
          onClearHistories({ appId, teamId, teamToken });
        }}
        onSetHistoryTop={(e) => {
          onUpdateHistory({ ...e, teamId, teamToken, appId });
        }}
        onSetCustomTitle={async (e) => {
          onUpdateHistory({
            appId,
            chatId: e.chatId,
            customTitle: e.title,
            teamId,
            teamToken
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
    t,
    teamId,
    teamToken
  ]);

  const loading = isLoading;

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
              chatData={chatData}
              history={chatRecords}
              showHistory
            />
            {/* chat box */}
            <Box flex={1}>
              {chatData.app.type === AppTypeEnum.plugin ? (
                <CustomPluginRunBox
                  pluginInputs={chatData.app.pluginInputs}
                  variablesForm={variablesForm}
                  histories={chatRecords}
                  setHistories={setChatRecords}
                  appId={chatData.appId}
                  tab={pluginRunTab}
                  setTab={setPluginRunTab}
                  onNewChat={() => onChangeChatId(getNanoid())}
                  onStartChat={startChat}
                />
              ) : (
                <ChatBox
                  ref={ChatBoxRef}
                  ScrollData={ScrollData}
                  chatHistories={chatRecords}
                  setChatHistories={setChatRecords}
                  variablesForm={variablesForm}
                  appAvatar={chatData.app.avatar}
                  userAvatar={chatData.userAvatar}
                  chatConfig={chatData.app?.chatConfig}
                  feedbackType={'user'}
                  onStartChat={startChat}
                  onDelMessage={({ contentId }) =>
                    delChatRecordById({
                      contentId,
                      appId: chatData.appId,
                      chatId,
                      teamId,
                      teamToken
                    })
                  }
                  appId={chatData.appId}
                  chatId={chatId}
                  teamId={teamId}
                  teamToken={teamToken}
                  chatType="team"
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
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();

  const { data: myApps = [], runAsync: loadMyApps } = useRequest2(
    async () => {
      if (teamId && teamToken) {
        return getMyTokensApps({ teamId, teamToken });
      }
      return [];
    },
    {
      manual: false
    }
  );

  // 初始化聊天框
  useEffect(() => {
    (async () => {
      if (appId || myApps.length === 0) return;

      router.replace({
        query: {
          ...router.query,
          appId: myApps[0]._id,
          chatId: ''
        }
      });
    })();
  }, [appId, loadMyApps, myApps, router, t, toast]);

  const contextParams = useMemo(() => {
    return { teamId, appId, teamToken };
  }, [teamId, appId, teamToken]);

  return (
    <ChatContextProvider params={contextParams}>
      <Chat {...props} myApps={myApps} />
    </ChatContextProvider>
  );
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
