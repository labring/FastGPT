import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { initShareChatInfo } from '@/api/support/outLink';
import { Box, Flex, useDisclosure, Drawer, DrawerOverlay, DrawerContent } from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { useGlobalStore } from '@/store/global';
import { useQuery } from '@tanstack/react-query';
import { streamFetch } from '@/api/fetch';
import { useShareChatStore, defaultHistory } from '@/store/shareChat';
import SideBar from '@/components/SideBar';
import { gptMessage2ChatType } from '@/utils/adapt';
import { getErrText } from '@/utils/tools';
import { ChatSiteItemType } from '@/types/chat';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

import ChatBox, { type ComponentRef, type StartChatFnProps } from '@/components/ChatBox';
import PageContainer from '@/components/PageContainer';
import ChatHeader from './components/ChatHeader';
import ChatHistorySlider from './components/ChatHistorySlider';
import { serviceSideProps } from '@/utils/web/i18n';

const OutLink = ({
  shareId,
  chatId,
  authToken
}: {
  shareId: string;
  chatId: string;
  authToken?: string;
}) => {
  const router = useRouter();
  const { toast } = useToast();
  const { isOpen: isOpenSlider, onClose: onCloseSlider, onOpen: onOpenSlider } = useDisclosure();
  const { isPc } = useGlobalStore();
  const forbidRefresh = useRef(false);
  const [isEmbed, setIdEmbed] = useState(true);

  const ChatBoxRef = useRef<ComponentRef>(null);

  const {
    shareChatData,
    setShareChatData,
    shareChatHistory,
    saveChatResponse,
    delShareChatHistoryItemById,
    delOneShareHistoryByChatId,
    delManyShareChatHistoryByShareId
  } = useShareChatStore();
  const history = useMemo(
    () => shareChatHistory.filter((item) => item.shareId === shareId),
    [shareChatHistory, shareId]
  );

  const startChat = useCallback(
    async ({ messages, controller, generatingMessage, variables }: StartChatFnProps) => {
      const prompts = messages.slice(-2);
      const completionChatId = chatId ? chatId : nanoid();

      const { responseText, responseData } = await streamFetch({
        data: {
          messages: prompts,
          variables,
          shareId,
          chatId: completionChatId,
          authToken
        },
        onMessage: generatingMessage,
        abortSignal: controller
      });

      const result: ChatSiteItemType[] = gptMessage2ChatType(prompts).map((item) => ({
        ...item,
        status: 'finish'
      }));
      result[1].value = responseText;
      result[1].responseData = responseData;

      /* save chat */
      saveChatResponse({
        chatId: completionChatId,
        prompts: result,
        variables,
        shareId
      });

      if (completionChatId !== chatId && controller.signal.reason !== 'leave') {
        forbidRefresh.current = true;
        router.replace({
          query: {
            shareId,
            chatId: completionChatId,
            authToken
          }
        });
      }

      window.top?.postMessage(
        {
          type: 'shareChatFinish',
          data: {
            question: result[0]?.value,
            answer: result[1]?.value
          }
        },
        '*'
      );

      return { responseText, responseData, isNewChat: forbidRefresh.current };
    },
    [authToken, chatId, router, saveChatResponse, shareId]
  );

  const loadAppInfo = useCallback(
    async (shareId: string, chatId: string, authToken?: string) => {
      if (!shareId) return null;
      const history = shareChatHistory.find((item) => item.chatId === chatId) || defaultHistory;

      ChatBoxRef.current?.resetHistory(history.chats);
      ChatBoxRef.current?.resetVariables(history.variables);

      try {
        const chatData = await (async () => {
          if (shareChatData.app.name === '') {
            return initShareChatInfo({
              shareId,
              authToken
            });
          }
          return shareChatData;
        })();

        setShareChatData({
          ...chatData,
          history
        });
      } catch (e: any) {
        toast({
          status: 'error',
          title: getErrText(e, '获取应用失败')
        });
        if (e?.code === 501) {
          delManyShareChatHistoryByShareId(shareId);
        }
      }

      if (history.chats.length > 0) {
        setTimeout(() => {
          ChatBoxRef.current?.scrollToBottom('auto');
        }, 500);
      }

      return history;
    },
    [delManyShareChatHistoryByShareId, setShareChatData, shareChatData, shareChatHistory, toast]
  );

  useQuery(['init', shareId, chatId, authToken], () => {
    if (forbidRefresh.current) {
      forbidRefresh.current = false;
      return null;
    }
    return loadAppInfo(shareId, chatId, authToken);
  });

  useEffect(() => {
    setIdEmbed(window !== parent);
  }, []);

  return (
    <PageContainer {...(isEmbed ? { p: '0 !important', borderRadius: '0' } : {})}>
      <Head>
        <title>{shareChatData.app.name}</title>
      </Head>
      <Flex h={'100%'} flexDirection={['column', 'row']}>
        {((children: React.ReactNode) => {
          return isPc ? (
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
              <DrawerContent maxWidth={'250px'} boxShadow={'2px 0 10px rgba(0,0,0,0.15)'}>
                {children}
              </DrawerContent>
            </Drawer>
          );
        })(
          <ChatHistorySlider
            appName={shareChatData.app.name}
            appAvatar={shareChatData.app.avatar}
            activeChatId={chatId}
            history={history.map((item) => ({
              id: item.chatId,
              title: item.title
            }))}
            onClose={onCloseSlider}
            onChangeChat={(chatId) => {
              console.log(chatId);

              router.replace({
                query: {
                  chatId: chatId || '',
                  shareId,
                  authToken
                }
              });
              if (!isPc) {
                onCloseSlider();
              }
            }}
            onDelHistory={delOneShareHistoryByChatId}
            onClearHistory={() => {
              delManyShareChatHistoryByShareId(shareId);
              router.replace({
                query: {
                  shareId,
                  authToken
                }
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
            appAvatar={shareChatData.app.avatar}
            appName={shareChatData.app.name}
            history={shareChatData.history.chats}
            onOpenSlider={onOpenSlider}
          />
          {/* chat box */}
          <Box flex={1}>
            <ChatBox
              active={!!shareChatData.app.name}
              ref={ChatBoxRef}
              appAvatar={shareChatData.app.avatar}
              userAvatar={shareChatData.userAvatar}
              userGuideModule={shareChatData.app?.userGuideModule}
              feedbackType={'user'}
              onUpdateVariable={(e) => {
                setShareChatData((state) => ({
                  ...state,
                  history: {
                    ...state.history,
                    variables: e
                  }
                }));
              }}
              onStartChat={startChat}
              onDelMessage={({ contentId, index }) =>
                delShareChatHistoryItemById({ chatId, contentId, index })
              }
            />
          </Box>
        </Flex>
      </Flex>
    </PageContainer>
  );
};

export async function getServerSideProps(context: any) {
  const shareId = context?.query?.shareId || '';
  const chatId = context?.query?.chatId || '';
  const authToken = context?.query?.authToken || '';

  return {
    props: { shareId, chatId, authToken, ...(await serviceSideProps(context)) }
  };
}

export default OutLink;
