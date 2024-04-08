import React, { useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { getInitChatInfo } from '@/web/core/chat/api';
import {
  Box,
  Flex,
  useDisclosure,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  useTheme
} from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useQuery } from '@tanstack/react-query';
import { streamFetch } from '@/web/common/api/fetch';
import { useChatStore } from '@/web/core/chat/storeChat';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);
import type { ChatHistoryItemType } from '@fastgpt/global/core/chat/type.d';
import { useTranslation } from 'next-i18next';

import ChatBox from '@/components/ChatBox';
import type { ComponentRef, StartChatFnProps } from '@/components/ChatBox/type.d';
import PageContainer from '@/components/PageContainer';
import SideBar from '@/components/SideBar';
import ChatHistorySlider from './components/ChatHistorySlider';
import SliderApps from './components/SliderApps';
import ChatHeader from './components/ChatHeader';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useUserStore } from '@/web/support/user/useUserStore';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useAppStore } from '@/web/core/app/store/useAppStore';
import { checkChatSupportSelectFileByChatModels } from '@/web/core/chat/utils';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';

const Chat = ({ appId, chatId }: { appId: string; chatId: string }) => {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useTranslation();
  const { toast } = useToast();

  const ChatBoxRef = useRef<ComponentRef>(null);
  const forbidRefresh = useRef(false);

  const {
    lastChatAppId,
    setLastChatAppId,
    lastChatId,
    setLastChatId,
    histories,
    loadHistories,
    pushHistory,
    updateHistory,
    delOneHistory,
    clearHistories,
    chatData,
    setChatData,
    delOneHistoryItem
  } = useChatStore();
  const { myApps, loadMyApps } = useAppStore();
  const { userInfo } = useUserStore();

  const { isPc } = useSystemStore();
  const { Loading, setIsLoading } = useLoading();
  const { isOpen: isOpenSlider, onClose: onCloseSlider, onOpen: onOpenSlider } = useDisclosure();

  const startChat = useCallback(
    async ({ messages, controller, generatingMessage, variables }: StartChatFnProps) => {
      const prompts = messages.slice(-2);
      const completionChatId = chatId ? chatId : nanoid();

      const { responseText, responseData } = await streamFetch({
        data: {
          messages: prompts,
          variables,
          appId,
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
              chatId: completionChatId,
              appId
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
            title: newTitle
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
    [appId, chatId, histories, pushHistory, router, setChatData, updateHistory]
  );

  useQuery(['loadModels'], () => loadMyApps(false));

  // get chat app info
  const loadChatInfo = useCallback(
    async ({
      appId,
      chatId,
      loading = false
    }: {
      appId: string;
      chatId: string;
      loading?: boolean;
    }) => {
      try {
        loading && setIsLoading(true);
        const res = await getInitChatInfo({ appId, chatId });
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
        // reset all chat tore
        setLastChatAppId('');
        setLastChatId('');
        toast({
          title: getErrText(e, t('core.chat.Failed to initialize chat')),
          status: 'error'
        });
        if (e?.code === 501) {
          router.replace('/app/list');
        } else if (chatId) {
          router.replace({
            query: {
              ...router.query,
              chatId: ''
            }
          });
        }
      }
      setIsLoading(false);
      return null;
    },
    [setIsLoading, setChatData, setLastChatAppId, setLastChatId, toast, t, router]
  );
  // 初始化聊天框
  useQuery(['init', { appId, chatId }], () => {
    // pc: redirect to latest model chat
    if (!appId && lastChatAppId) {
      return router.replace({
        query: {
          appId: lastChatAppId,
          chatId: lastChatId
        }
      });
    }
    if (!appId && myApps[0]) {
      return router.replace({
        query: {
          appId: myApps[0]._id,
          chatId: lastChatId
        }
      });
    }
    if (!appId) {
      (async () => {
        const apps = await loadMyApps();
        if (apps.length === 0) {
          toast({
            status: 'error',
            title: t('core.chat.You need to a chat app')
          });
          router.replace('/app/list');
        } else {
          router.replace({
            query: {
              appId: apps[0]._id,
              chatId: lastChatId
            }
          });
        }
      })();
      return;
    }

    // store id
    appId && setLastChatAppId(appId);
    setLastChatId(chatId);

    if (forbidRefresh.current) {
      forbidRefresh.current = false;
      return null;
    }

    return loadChatInfo({
      appId,
      chatId,
      loading: appId !== chatData.appId
    });
  });

  useQuery(['loadHistories', appId], () => (appId ? loadHistories({ appId }) : null));

  return (
    <Flex h={'100%'}>
      <Head>
        <title>{chatData.app.name}</title>
      </Head>
      {/* pc show myself apps */}
      {isPc && (
        <Box borderRight={theme.borders.base} w={'220px'} flexShrink={0}>
          <SliderApps apps={myApps} activeAppId={appId} />
        </Box>
      )}

      <PageContainer flex={'1 0 0'} w={0} p={[0, '16px']} position={'relative'}>
        <Flex h={'100%'} flexDirection={['column', 'row']} bg={'white'}>
          {/* pc always show history. */}
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
              apps={myApps}
              confirmClearText={t('core.chat.Confirm to clear history')}
              appId={appId}
              appName={chatData.app.name}
              appAvatar={chatData.app.avatar}
              activeChatId={chatId}
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
                    chatId: chatId || '',
                    appId
                  }
                });
                if (!isPc) {
                  onCloseSlider();
                }
              }}
              onDelHistory={(e) => delOneHistory({ ...e, appId })}
              onClearHistory={() => {
                clearHistories({ appId });
                router.replace({
                  query: {
                    appId
                  }
                });
              }}
              onSetHistoryTop={(e) => {
                updateHistory({ ...e, appId });
              }}
              onSetCustomTitle={async (e) => {
                updateHistory({
                  appId,
                  chatId: e.chatId,
                  title: e.title,
                  customTitle: e.title
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
              appId={appId}
              history={chatData.history}
              chatModels={chatData.app.chatModels}
              onOpenSlider={onOpenSlider}
              showHistory
            />

            {/* chat box */}
            <Box flex={1}>
              <ChatBox
                ref={ChatBoxRef}
                showEmptyIntro
                appAvatar={chatData.app.avatar}
                userAvatar={userInfo?.avatar}
                userGuideModule={chatData.app?.userGuideModule}
                showFileSelector={checkChatSupportSelectFileByChatModels(chatData.app.chatModels)}
                feedbackType={'user'}
                onStartChat={startChat}
                onDelMessage={(e) => delOneHistoryItem({ ...e, appId, chatId })}
                appId={appId}
                chatId={chatId}
              />
            </Box>
          </Flex>
        </Flex>
        <Loading fixed={false} />
      </PageContainer>
    </Flex>
  );
};

export async function getServerSideProps(context: any) {
  return {
    props: {
      appId: context?.query?.appId || '',
      chatId: context?.query?.chatId || '',
      ...(await serviceSideProps(context))
    }
  };
}

export default Chat;
