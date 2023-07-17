import React, { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { initShareChatInfo } from '@/api/chat';
import { Box, Flex, useDisclosure, Drawer, DrawerOverlay, DrawerContent } from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { useGlobalStore } from '@/store/global';
import { useQuery } from '@tanstack/react-query';
import { streamFetch } from '@/api/fetch';
import { useShareChatStore, defaultHistory } from '@/store/shareChat';
import SideBar from '@/components/SideBar';
import { gptMessage2ChatType } from '@/utils/adapt';
import { getErrText } from '@/utils/tools';
import dynamic from 'next/dynamic';
import ChatBox, { type ComponentRef, type StartChatFnProps } from '@/components/ChatBox';
import PageContainer from '@/components/PageContainer';
import ChatHeader from './components/ChatHeader';

const ChatHistorySlider = dynamic(() => import('./components/ChatHistorySlider'), {
  ssr: false
});

const ShareChat = ({ shareId, historyId }: { shareId: string; historyId: string }) => {
  const router = useRouter();
  const { toast } = useToast();
  const { isOpen: isOpenSlider, onClose: onCloseSlider, onOpen: onOpenSlider } = useDisclosure();
  const { isPc } = useGlobalStore();

  const ChatBoxRef = useRef<ComponentRef>(null);

  const {
    shareChatData,
    setShareChatData,
    shareChatHistory,
    saveChatResponse,
    delShareChatHistoryItemById,
    delOneShareHistoryByHistoryId,
    delManyShareChatHistoryByShareId
  } = useShareChatStore();

  const startChat = useCallback(
    async ({ messages, controller, generatingMessage, variables }: StartChatFnProps) => {
      const prompts = messages.slice(-shareChatData.maxContext - 2);
      const { responseText } = await streamFetch({
        data: {
          history,
          messages: prompts,
          variables,
          shareId
        },
        onMessage: generatingMessage,
        abortSignal: controller
      });

      const result = {
        question: messages[messages.length - 2].content || '',
        answer: responseText
      };

      prompts[prompts.length - 1].content = responseText;

      /* save chat */
      const { newChatId } = saveChatResponse({
        historyId,
        prompts: gptMessage2ChatType(prompts).map((item) => ({
          ...item,
          status: 'finish'
        })),
        variables,
        shareId
      });

      if (newChatId) {
        router.replace({
          query: {
            shareId,
            historyId: newChatId
          }
        });
      }

      window.top?.postMessage(
        {
          type: 'shareChatFinish',
          data: result
        },
        '*'
      );

      return { responseText };
    },
    [historyId, router, saveChatResponse, shareChatData.maxContext, shareId]
  );

  const loadAppInfo = useCallback(
    async (shareId: string, historyId: string) => {
      console.log(shareId, historyId);

      if (!shareId) return null;
      const history = shareChatHistory.find((item) => item._id === historyId) || defaultHistory;

      ChatBoxRef.current?.resetHistory(history.chats);
      ChatBoxRef.current?.resetVariables(history.variables);

      try {
        const chatData = await (async () => {
          if (shareChatData.app.name === '') {
            return initShareChatInfo({
              shareId
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
        ChatBoxRef.current?.scrollToBottom('auto');
      }

      return history;
    },
    [delManyShareChatHistoryByShareId, setShareChatData, shareChatData, shareChatHistory, toast]
  );

  useQuery(['init', shareId, historyId], () => {
    return loadAppInfo(shareId, historyId);
  });

  return (
    <PageContainer>
      <Flex h={'100%'} flexDirection={['column', 'row']}>
        {((children: React.ReactNode) => {
          return isPc ? (
            <SideBar>{children}</SideBar>
          ) : (
            <Drawer isOpen={isOpenSlider} placement="left" size={'xs'} onClose={onCloseSlider}>
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
            activeHistoryId={historyId}
            history={shareChatHistory.map((item) => ({
              id: item._id,
              title: item.title
            }))}
            onChangeChat={(historyId) => {
              router.push({
                query: {
                  historyId: historyId || '',
                  shareId
                }
              });
              if (!isPc) {
                onCloseSlider();
              }
            }}
            onDelHistory={delOneShareHistoryByHistoryId}
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
              ref={ChatBoxRef}
              appAvatar={shareChatData.app.avatar}
              variableModules={shareChatData.app.variableModules}
              welcomeText={shareChatData.app.welcomeText}
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
              onDelMessage={({ index }) => delShareChatHistoryItemById({ historyId, index })}
            />
          </Box>
        </Flex>
      </Flex>
    </PageContainer>
  );
};

export async function getServerSideProps(context: any) {
  const shareId = context?.query?.shareId || '';
  const historyId = context?.query?.historyId || '';

  return {
    props: { shareId, historyId }
  };
}

export default ShareChat;
