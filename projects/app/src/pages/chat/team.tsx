import React, { useCallback, useEffect, useRef, useState } from 'react';
import NextHead from '@/components/common/NextHead';
import { delChatRecordById, getChatHistories, getTeamChatInfo } from '@/web/core/chat/api';
import { useRouter } from 'next/router';
import { Box, Flex, Drawer, DrawerOverlay, DrawerContent, useTheme } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import SideBar from '@/components/SideBar';
import PageContainer from '@/components/PageContainer';
import { getMyTokensApps } from '@/web/core/chat/api';
import ChatHistorySlider from './components/ChatHistorySlider';
import ChatHeader from './components/ChatHeader';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useTranslation } from 'next-i18next';
import { checkChatSupportSelectFileByChatModels } from '@/web/core/chat/utils';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);
import ChatBox from '@/components/ChatBox';
import type { ComponentRef, StartChatFnProps } from '@/components/ChatBox/type.d';
import { streamFetch } from '@/web/common/api/fetch';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import SliderApps from './components/SliderApps';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import ChatContextProvider, { ChatContext } from '@/web/core/chat/context/chatContext';
import { AppListItemType } from '@fastgpt/global/core/app/type';
import { useContextSelector } from 'use-context-selector';
import { InitChatResponse } from '@/global/core/chat/api';
import { defaultChatData } from '@/global/core/chat/constants';

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
  const { isPc } = useSystemStore();
  const ChatBoxRef = useRef<ComponentRef>(null);

  const [chatData, setChatData] = useState<InitChatResponse>(defaultChatData);

  const {
    loadHistories,
    onUpdateHistory,
    onClearHistories,
    onDelHistory,
    isOpenSlider,
    onCloseSlider,
    forbidLoadChat,
    onChangeChatId,
    onChangeAppId
  } = useContextSelector(ChatContext, (v) => v);

  const startChat = useCallback(
    async ({ messages, controller, generatingMessage, variables }: StartChatFnProps) => {
      const prompts = messages.slice(-2);
      const completionChatId = chatId ? chatId : nanoid();

      const { responseText, responseData } = await streamFetch({
        data: {
          messages: prompts,
          variables: {
            ...variables,
            ...customVariables
          },
          appId,
          teamId,
          teamToken,
          chatId: completionChatId
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      const newTitle = getChatTitleFromChatMessage(GPTMessages2Chats(prompts)[0]);

      // new chat
      if (completionChatId !== chatId) {
        onChangeChatId(completionChatId, true);
        loadHistories();
      } else {
        onUpdateHistory({
          appId: chatData.appId,
          chatId: completionChatId,
          title: newTitle,
          teamId,
          teamToken
        });
      }
      // update chat window
      setChatData((state) => ({
        ...state,
        title: newTitle,
        history: ChatBoxRef.current?.getChatHistories() || state.history
      }));

      return { responseText, responseData, isNewChat: forbidLoadChat.current };
    },
    [
      chatId,
      customVariables,
      appId,
      teamId,
      teamToken,
      forbidLoadChat,
      onChangeChatId,
      loadHistories,
      onUpdateHistory,
      chatData.appId
    ]
  );

  // get chat app info
  const { loading } = useRequest2(
    async () => {
      if (!appId || forbidLoadChat.current) return;

      const res = await getTeamChatInfo({ teamId, appId, chatId, teamToken });
      const history = res.history.map((item) => ({
        ...item,
        dataId: item.dataId || nanoid(),
        status: ChatStatusEnum.finish
      }));

      const result: InitChatResponse = {
        ...res,
        history
      };

      // have records.
      ChatBoxRef.current?.resetHistory(history);
      ChatBoxRef.current?.resetVariables(res.variables);
      if (res.history.length > 0) {
        setTimeout(() => {
          ChatBoxRef.current?.scrollToBottom('auto');
        }, 500);
      }

      setChatData(result);
    },
    {
      manual: false,
      refreshDeps: [teamId, teamToken, appId, chatId],
      onError(e: any) {
        toast({
          title: getErrText(e, t('core.chat.Failed to initialize chat')),
          status: 'error'
        });
        if (chatId) {
          onChangeChatId('');
        }
      },
      onFinally() {
        forbidLoadChat.current = false;
      }
    }
  );

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
          {((children: React.ReactNode) => {
            return isPc || !appId ? (
              <SideBar>{children}</SideBar>
            ) : (
              <Drawer
                isOpen={isOpenSlider}
                placement="left"
                autoFocus={false}
                size={'xs'}
                onClose={onCloseSlider}
              >
                <DrawerOverlay backgroundColor={'rgba(255,255,255,0.5)'} />
                <DrawerContent maxWidth={'75vw'}>{children}</DrawerContent>
              </Drawer>
            );
          })(
            <ChatHistorySlider
              appId={appId}
              apps={myApps}
              appName={chatData.app.name}
              appAvatar={chatData.app.avatar}
              confirmClearText={t('core.chat.Confirm to clear history')}
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
          )}
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
              appAvatar={chatData.app.avatar}
              appName={chatData.app.name}
              history={chatData.history}
              showHistory
            />
            {/* chat box */}
            <Box flex={1}>
              <ChatBox
                ref={ChatBoxRef}
                appAvatar={chatData.app.avatar}
                userAvatar={chatData.userAvatar}
                chatConfig={chatData.app?.chatConfig}
                showFileSelector={checkChatSupportSelectFileByChatModels(chatData.app.chatModels)}
                feedbackType={'user'}
                onUpdateVariable={(e) => {}}
                onStartChat={startChat}
                onDelMessage={({ contentId }) =>
                  delChatRecordById({ contentId, appId: chatData.appId, chatId, teamId, teamToken })
                }
                appId={chatData.appId}
                chatId={chatId}
                teamId={teamId}
                teamToken={teamToken}
              />
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

  const { data: histories = [], runAsync: loadHistories } = useRequest2(
    async () => {
      if (teamId && appId && teamToken) {
        return getChatHistories({ teamId, appId, teamToken: teamToken });
      }
      return [];
    },
    {
      manual: false,
      refreshDeps: [appId, teamId, teamToken]
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

  return (
    <ChatContextProvider histories={histories} loadHistories={loadHistories}>
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
      ...(await serviceSideProps(context, ['file']))
    }
  };
}

export default Render;
