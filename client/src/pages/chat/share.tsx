import React, { useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { initShareChatInfo } from '@/api/chat';
import {
  Box,
  Flex,
  useColorModeValue,
  useDisclosure,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  useTheme
} from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { useGlobalStore } from '@/store/global';
import { useQuery } from '@tanstack/react-query';
import { streamFetch } from '@/api/fetch';
import { useShareChatStore, defaultHistory } from '@/store/shareChat';
import SideBar from '@/components/SideBar';
import { gptMessage2ChatType } from '@/utils/adapt';
import { getErrText } from '@/utils/tools';

import ChatBox, { type ComponentRef, type StartChatFnProps } from '@/components/ChatBox';
import MyIcon from '@/components/Icon';
import Tag from '@/components/Tag';
import PageContainer from '@/components/PageContainer';
import ChatHistorySlider from './components/ChatHistorySlider';

const ShareChat = () => {
  const theme = useTheme();
  const router = useRouter();
  const { shareId = '', historyId } = router.query as { shareId: string; historyId: string };
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
      console.log(messages, variables);

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
    async (shareId?: string) => {
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
    [
      delManyShareChatHistoryByShareId,
      historyId,
      setShareChatData,
      shareChatData,
      shareChatHistory,
      toast
    ]
  );

  useQuery(['init', shareId, historyId], () => {
    return loadAppInfo(shareId);
  });

  return (
    <PageContainer>
      <Flex h={'100%'} flexDirection={['column', 'row']}>
        {/*  slider */}
        {isPc ? (
          <SideBar>
            <ChatHistorySlider
              appName={shareChatData.app.name}
              appAvatar={shareChatData.app.avatar}
              activeHistoryId={historyId}
              history={shareChatHistory
                .filter((item) => item.shareId === shareId)
                .map((item) => ({
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
              }}
              onDelHistory={delOneShareHistoryByHistoryId}
              onCloseSlider={onCloseSlider}
            />
          </SideBar>
        ) : (
          <Drawer isOpen={isOpenSlider} placement="left" size={'xs'} onClose={onCloseSlider}>
            <DrawerOverlay backgroundColor={'rgba(255,255,255,0.5)'} />
            <DrawerContent maxWidth={'250px'}>
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
                }}
                onDelHistory={delOneShareHistoryByHistoryId}
                onCloseSlider={onCloseSlider}
              />
            </DrawerContent>
          </Drawer>
        )}
        {/* chat container */}
        <Flex
          position={'relative'}
          h={[0, '100%']}
          w={['100%', 0]}
          flex={'1 0 0'}
          flexDirection={'column'}
        >
          <Flex
            alignItems={'center'}
            py={[3, 5]}
            px={5}
            borderBottom={theme.borders.base}
            borderBottomColor={useColorModeValue('gray.200', 'gray.700')}
            color={useColorModeValue('myGray.900', 'white')}
          >
            {isPc ? (
              <>
                <Box mr={3} color={'myGray.1000'}>
                  {shareChatData.history.title}
                </Box>
                <Tag display={'flex'}>
                  <MyIcon name={'history'} w={'14px'} />
                  <Box ml={1}>{shareChatData.history.chats.length}条记录</Box>
                </Tag>
              </>
            ) : (
              <>
                <MyIcon
                  name={'menu'}
                  w={'20px'}
                  h={'20px'}
                  color={useColorModeValue('blackAlpha.700', 'white')}
                  onClick={onOpenSlider}
                />
              </>
            )}
          </Flex>
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

export default ShareChat;
