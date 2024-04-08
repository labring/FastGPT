import React, { useCallback, useEffect, useRef } from 'react';
import Head from 'next/head';
import { getTeamChatInfo } from '@/web/core/chat/api';
import { useRouter } from 'next/router';
import {
  Box,
  Flex,
  useDisclosure,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  useTheme
} from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useQuery } from '@tanstack/react-query';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import SideBar from '@/components/SideBar';
import PageContainer from '@/components/PageContainer';
import { getMyTokensApps } from '@/web/core/chat/api';
import ChatHistorySlider from './components/ChatHistorySlider';
import ChatHeader from './components/ChatHeader';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useTranslation } from 'next-i18next';
import { checkChatSupportSelectFileByChatModels } from '@/web/core/chat/utils';
import { useChatStore } from '@/web/core/chat/storeChat';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);
import ChatBox from '@/components/ChatBox';
import type { ComponentRef, StartChatFnProps } from '@/components/ChatBox/type.d';
import { streamFetch } from '@/web/common/api/fetch';
import type { ChatHistoryItemType } from '@fastgpt/global/core/chat/type.d';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import MyBox from '@/components/common/MyBox';
import SliderApps from './components/SliderApps';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';

const OutLink = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    teamId = '',
    appId = '',
    chatId = '',
    teamToken,
    ...customVariables
  } = router.query as {
    teamId: string;
    appId: string;
    chatId: string;
    teamToken: string;
    [key: string]: string;
  };

  const { toast } = useToast();
  const theme = useTheme();
  const { isPc } = useSystemStore();
  const ChatBoxRef = useRef<ComponentRef>(null);
  const forbidRefresh = useRef(false);

  const { isOpen: isOpenSlider, onClose: onCloseSlider, onOpen: onOpenSlider } = useDisclosure();
  const {
    chatData,
    setChatData,
    histories,
    loadHistories,
    lastChatAppId,
    lastChatId,
    pushHistory,
    updateHistory,
    delOneHistory,
    delOneHistoryItem,
    clearHistories
  } = useChatStore();

  const startChat = useCallback(
    async ({ messages, controller, generatingMessage, variables }: StartChatFnProps) => {
      const prompts = messages.slice(-2);
      const completionChatId = chatId ? chatId : nanoid();

      const { responseText, responseData } = await streamFetch({
        data: {
          messages: prompts,
          variables: {
            ...customVariables,
            ...variables
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
        const newHistory: ChatHistoryItemType = {
          chatId: completionChatId,
          updateTime: new Date(),
          title: newTitle,
          appId,
          top: false
        };
        pushHistory(newHistory);
        if (controller.signal.reason !== 'leave') {
          forbidRefresh.current = true;
          router.replace({
            query: {
              ...router.query,
              chatId: completionChatId
            }
          });
        }
      } else {
        // update chat
        const currentChat = histories.find((item) => item.chatId === chatId);
        currentChat &&
          updateHistory({
            ...currentChat,
            updateTime: new Date(),
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

      return { responseText, responseData, isNewChat: forbidRefresh.current };
    },
    [appId, teamToken, chatId, histories, pushHistory, router, setChatData, teamId, updateHistory]
  );

  /* replace router query to last chat */
  useEffect(() => {
    if ((!chatId || !appId) && (lastChatId || lastChatAppId)) {
      router.replace({
        query: {
          ...router.query,
          chatId: chatId || lastChatId,
          appId: appId || lastChatAppId
        }
      });
    }
  }, []);

  // get chat app list
  const loadApps = useCallback(async () => {
    try {
      const apps = await getMyTokensApps({ teamId, teamToken });

      if (apps.length <= 0) {
        toast({
          status: 'error',
          title: t('core.chat.You need to a chat app')
        });
        return [];
      }

      // if app id not exist, redirect to first app
      if (!appId || !apps.find((item) => item._id === appId)) {
        router.replace({
          query: {
            ...router.query,
            appId: apps[0]?._id
          }
        });
      }
      return apps;
    } catch (error: any) {
      toast({
        status: 'warning',
        title: getErrText(error)
      });
    }
    return [];
  }, [appId, teamToken, router, teamId, t, toast]);
  const { data: myApps = [], isLoading: isLoadingApps } = useQuery(['initApps', teamId], () => {
    if (!teamId) {
      toast({
        status: 'error',
        title: t('support.user.team.tag.Have not opened')
      });
      return;
    }
    return loadApps();
  });

  // load histories
  useQuery(['loadHistories', appId], () => {
    if (teamId && appId) {
      return loadHistories({ teamId, appId, teamToken: teamToken });
    }
    return;
  });

  // get chat app info
  const loadChatInfo = useCallback(async () => {
    try {
      const res = await getTeamChatInfo({ teamId, appId, chatId, teamToken: teamToken });

      const history = res.history.map((item) => ({
        ...item,
        dataId: item.dataId || nanoid(),
        status: ChatStatusEnum.finish
      }));

      setChatData({
        ...res,
        history
      });

      // have records.
      ChatBoxRef.current?.resetHistory(history);
      ChatBoxRef.current?.resetVariables(res.variables);

      if (res.history.length > 0) {
        setTimeout(() => {
          ChatBoxRef.current?.scrollToBottom('auto');
        }, 500);
      }
    } catch (e: any) {
      toast({
        title: t('core.chat.Failed to initialize chat'),
        status: 'error'
      });
      if (chatId) {
        router.replace({
          query: {
            ...router.query,
            chatId: ''
          }
        });
      }
    }
    return null;
  }, [teamId, appId, chatId, teamToken, setChatData, toast, t, router]);
  const { isFetching } = useQuery(['init', teamId, appId, chatId], () => {
    if (forbidRefresh.current) {
      forbidRefresh.current = false;
      return null;
    }
    if (teamId && appId) {
      return loadChatInfo();
    }
    return null;
  });

  return (
    <MyBox display={'flex'} h={'100%'} isLoading={isLoadingApps || isFetching}>
      <Head>
        <title>{chatData.app.name}</title>
      </Head>
      {/* pc show myself apps */}
      {isPc && (
        <Box borderRight={theme.borders.base} w={'220px'} flexShrink={0}>
          <SliderApps showExist={false} apps={myApps} activeAppId={appId} />
        </Box>
      )}

      <PageContainer flex={'1 0 0'} w={0} p={[0, '16px']} position={'relative'}>
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
                <DrawerContent maxWidth={'250px'}>{children}</DrawerContent>
              </Drawer>
            );
          })(
            <ChatHistorySlider
              appId={appId}
              apps={myApps}
              appName={chatData.app.name}
              appAvatar={chatData.app.avatar}
              activeChatId={chatId}
              confirmClearText={t('core.chat.Confirm to clear history')}
              onClose={onCloseSlider}
              history={histories.map((item, i) => ({
                id: item.chatId,
                title: item.title,
                customTitle: item.customTitle,
                top: item.top
              }))}
              onChangeChat={(chatId) => {
                router.replace({
                  query: {
                    ...router.query,
                    chatId: chatId || ''
                  }
                });
                if (!isPc) {
                  onCloseSlider();
                }
              }}
              onDelHistory={(e) => delOneHistory({ ...e, appId, teamId, teamToken })}
              onClearHistory={() => {
                clearHistories({ appId, teamId, teamToken });
                router.replace({
                  query: {
                    ...router.query,
                    chatId: ''
                  }
                });
              }}
              onSetHistoryTop={(e) => {
                updateHistory({ ...e, teamId, teamToken, appId });
              }}
              onSetCustomTitle={async (e) => {
                updateHistory({
                  appId,
                  chatId: e.chatId,
                  title: e.title,
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
              onOpenSlider={onOpenSlider}
              showHistory
            />
            {/* chat box */}
            <Box flex={1}>
              <ChatBox
                active={!!chatData.app.name}
                ref={ChatBoxRef}
                appAvatar={chatData.app.avatar}
                userAvatar={chatData.userAvatar}
                userGuideModule={chatData.app?.userGuideModule}
                showFileSelector={checkChatSupportSelectFileByChatModels(chatData.app.chatModels)}
                feedbackType={'user'}
                onUpdateVariable={(e) => {}}
                onStartChat={startChat}
                onDelMessage={(e) =>
                  delOneHistoryItem({ ...e, appId: chatData.appId, chatId, teamId, teamToken })
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
    </MyBox>
  );
};

export async function getServerSideProps(context: any) {
  return {
    props: {
      ...(await serviceSideProps(context))
    }
  };
}

export default OutLink;
