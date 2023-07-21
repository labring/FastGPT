import React, { useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { getInitChatSiteInfo, delChatRecordByIndex, putChatHistory } from '@/api/chat';
import {
  Box,
  Flex,
  useDisclosure,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  useTheme
} from '@chakra-ui/react';
import { useGlobalStore } from '@/store/global';
import { useQuery } from '@tanstack/react-query';
import { streamFetch } from '@/api/fetch';
import { useChatStore } from '@/store/chat';
import { useLoading } from '@/hooks/useLoading';

import ChatBox, { type ComponentRef, type StartChatFnProps } from '@/components/ChatBox';
import { ChatHistoryItemType } from '@/types/chat';
import PageContainer from '@/components/PageContainer';
import SideBar from '@/components/SideBar';
import ChatHistorySlider from './components/ChatHistorySlider';
import SliderApps from './components/SliderApps';
import ChatHeader from './components/ChatHeader';

const Chat = () => {
  const router = useRouter();
  const { appId = '', chatId = '' } = router.query as { appId: string; chatId: string };
  const theme = useTheme();

  const ChatBoxRef = useRef<ComponentRef>(null);
  const forbidRefresh = useRef(false);

  const {
    lastChatAppId,
    setLastChatAppId,
    lastChatId,
    setLastChatId,
    history,
    loadHistory,
    updateHistory,
    delHistory,
    chatData,
    setChatData
  } = useChatStore();

  const { isPc } = useGlobalStore();
  const { Loading, setIsLoading } = useLoading();
  const { isOpen: isOpenSlider, onClose: onCloseSlider, onOpen: onOpenSlider } = useDisclosure();

  const startChat = useCallback(
    async ({ messages, controller, generatingMessage, variables }: StartChatFnProps) => {
      const prompts = messages.slice(-2);
      const { responseText, newChatId, rawSearch } = await streamFetch({
        data: {
          messages: prompts,
          variables,
          appId,
          chatId
        },
        onMessage: generatingMessage,
        abortSignal: controller
      });

      const newTitle = prompts[0].content?.slice(0, 20) || '新对话';

      // update history
      if (newChatId && !controller.signal.aborted) {
        forbidRefresh.current = true;
        const newHistory: ChatHistoryItemType = {
          _id: newChatId,
          updateTime: new Date(),
          title: newTitle,
          appId,
          top: false
        };
        updateHistory(newHistory);
        router.replace({
          query: {
            chatId: newChatId,
            appId
          }
        });
      } else {
        const currentChat = history.find((item) => item._id === chatId);
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
        history: ChatBoxRef.current?.getChatHistory() || state.history
      }));

      return { responseText, rawSearch };
    },
    [appId, chatId, history, router, setChatData, updateHistory]
  );

  // 删除一句话
  const delOneHistoryItem = useCallback(
    async ({ contentId, index }: { contentId?: string; index: number }) => {
      if (!chatId || !contentId) return;

      try {
        setChatData((state) => ({
          ...state,
          history: state.history.filter((_, i) => i !== index)
        }));
        await delChatRecordByIndex({ chatId, contentId });
      } catch (err) {
        console.log(err);
      }
    },
    [chatId, setChatData]
  );

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
        const res = await getInitChatSiteInfo({ appId, chatId });
        const history = res.history.map((item) => ({
          ...item,
          status: 'finish' as any
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
          }, 200);
        }

        // empty appId request, return first app
        if (res.appId !== appId) {
          forbidRefresh.current = true;
          router.replace({
            query: {
              appId: res.appId
            }
          });
        }
      } catch (e: any) {
        // reset all chat tore
        setLastChatAppId('');
        setLastChatId('');
        router.replace('/chat');
      }
      setIsLoading(false);
      return null;
    },
    [setIsLoading, setChatData, router, setLastChatAppId, setLastChatId]
  );
  // 初始化聊天框
  useQuery(['init', appId, chatId], () => {
    // pc: redirect to latest model chat
    if (!appId && lastChatAppId) {
      router.replace({
        query: {
          appId: lastChatAppId,
          chatId: lastChatId
        }
      });
      return null;
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

  useQuery(['loadHistory', appId], () => (appId ? loadHistory({ appId }) : null));

  return (
    <Flex h={'100%'}>
      {/* pc show myself apps */}
      {isPc && (
        <Box p={5} borderRight={theme.borders.base} w={'220px'} flexShrink={0}>
          <SliderApps appId={appId} />
        </Box>
      )}

      <PageContainer flex={'1 0 0'} w={0} bg={'myWhite.600'} position={'relative'}>
        <Flex h={'100%'} flexDirection={['column', 'row']}>
          {/* pc always show history. */}
          {((children: React.ReactNode) => {
            return isPc || !appId ? (
              <SideBar>{children}</SideBar>
            ) : (
              <Drawer isOpen={isOpenSlider} placement="left" size={'xs'} onClose={onCloseSlider}>
                <DrawerOverlay backgroundColor={'rgba(255,255,255,0.5)'} />
                <DrawerContent maxWidth={'250px'}>{children}</DrawerContent>
              </Drawer>
            );
          })(
            <ChatHistorySlider
              appId={appId}
              appName={chatData.app.name}
              appAvatar={chatData.app.avatar}
              activeChatId={chatId}
              history={history.map((item) => ({
                id: item._id,
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
              onDelHistory={delHistory}
              onSetHistoryTop={async (e) => {
                try {
                  await putChatHistory(e);
                  const historyItem = history.find((item) => item._id === e.chatId);
                  if (!historyItem) return;
                  updateHistory({
                    ...historyItem,
                    top: e.top
                  });
                } catch (error) {}
              }}
              onSetCustomTitle={async (e) => {
                try {
                  await putChatHistory({
                    chatId: e.chatId,
                    customTitle: e.title
                  });
                  const historyItem = history.find((item) => item._id === e.chatId);
                  if (!historyItem) return;
                  updateHistory({
                    ...historyItem,
                    customTitle: e.title
                  });
                } catch (error) {}
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
            />

            {/* chat box */}
            <Box flex={1}>
              <ChatBox
                ref={ChatBoxRef}
                showEmptyIntro
                chatId={chatId}
                appAvatar={chatData.app.avatar}
                variableModules={chatData.app.variableModules}
                welcomeText={chatData.app.welcomeText}
                onUpdateVariable={(e) => {}}
                onStartChat={startChat}
                onDelMessage={delOneHistoryItem}
              />
            </Box>
          </Flex>
        </Flex>
        <Loading fixed={false} />
      </PageContainer>
    </Flex>
  );
};

export default Chat;
