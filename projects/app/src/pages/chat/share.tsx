import React, { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Box, Flex, useDisclosure, Drawer, DrawerOverlay, DrawerContent } from '@chakra-ui/react';
import { useToast } from '@/web/common/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useQuery } from '@tanstack/react-query';
import { streamFetch } from '@/web/common/api/fetch';
import { useShareChatStore } from '@/web/core/chat/storeShareChat';
import SideBar from '@/components/SideBar';
import { gptMessage2ChatType } from '@/utils/adapt';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { ChatHistoryItemType, ChatSiteItemType } from '@fastgpt/global/core/chat/type.d';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

import ChatBox, { type ComponentRef, type StartChatFnProps } from '@/components/ChatBox';
import PageContainer from '@/components/PageContainer';
import ChatHeader from './components/ChatHeader';
import ChatHistorySlider from './components/ChatHistorySlider';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { checkChatSupportSelectFileByChatModels } from '@/web/core/chat/utils';
import { useTranslation } from 'next-i18next';
import { getInitOutLinkChatInfo } from '@/web/core/chat/api';
import { POST } from '@/web/common/api/request';
import { chatContentReplaceBlock } from '@fastgpt/global/core/chat/utils';
import { useChatStore } from '@/web/core/chat/storeChat';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import MyBox from '@/components/common/MyBox';

const OutLink = ({
  shareId,
  chatId,
  showHistory,
  authToken
}: {
  shareId: string;
  chatId: string;
  showHistory: '0' | '1';
  authToken?: string;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { isOpen: isOpenSlider, onClose: onCloseSlider, onOpen: onOpenSlider } = useDisclosure();
  const { isPc } = useSystemStore();
  const ChatBoxRef = useRef<ComponentRef>(null);
  const forbidRefresh = useRef(false);
  const initSign = useRef(false);
  const [isEmbed, setIdEmbed] = useState(true);

  const {
    localUId,
    shareChatHistory, // abandon
    clearLocalHistory // abandon
  } = useShareChatStore();
  const {
    histories,
    loadHistories,
    pushHistory,
    updateHistory,
    delOneHistory,
    chatData,
    setChatData,
    delOneHistoryItem,
    clearHistories
  } = useChatStore();
  const appId = chatData.appId;
  const outLinkUid: string = authToken || localUId;

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
          outLinkUid
        },
        onMessage: generatingMessage,
        abortSignal: controller
      });

      const newTitle =
        chatContentReplaceBlock(prompts[0].content).slice(0, 20) ||
        prompts[1]?.value?.slice(0, 20) ||
        t('core.chat.New Chat');

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
            shareId,
            outLinkUid
          });
      }

      // update chat window
      setChatData((state) => ({
        ...state,
        title: newTitle,
        history: ChatBoxRef.current?.getChatHistories() || state.history
      }));

      /* post message to report result */
      const result: ChatSiteItemType[] = gptMessage2ChatType(prompts).map((item) => ({
        ...item,
        status: 'finish'
      }));
      result[1].value = responseText;
      result[1].responseData = responseData;

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
    [chatId, shareId, outLinkUid, setChatData, appId, pushHistory, router, histories, updateHistory]
  );

  const loadChatInfo = useCallback(
    async (shareId: string, chatId: string) => {
      if (!shareId) return null;

      try {
        const res = await getInitOutLinkChatInfo({
          chatId,
          shareId,
          outLinkUid
        });
        const history = res.history.map((item) => ({
          ...item,
          status: ChatStatusEnum.finish
        }));

        setChatData({
          ...res,
          history
        });

        ChatBoxRef.current?.resetHistory(history);
        ChatBoxRef.current?.resetVariables(res.variables);

        // send init message
        if (!initSign.current) {
          initSign.current = true;
          if (window !== top) {
            window.top?.postMessage({ type: 'shareChatReady' }, '*');
          }
        }

        if (chatId && res.history.length > 0) {
          setTimeout(() => {
            ChatBoxRef.current?.scrollToBottom('auto');
          }, 500);
        }
      } catch (e: any) {
        console.log(e);
        toast({
          status: 'error',
          title: getErrText(e, t('core.shareChat.Init Error'))
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
    },
    [outLinkUid, router, setChatData, t, toast]
  );

  const { isFetching } = useQuery(['init', shareId, chatId], () => {
    if (forbidRefresh.current) {
      forbidRefresh.current = false;
      return null;
    }

    return loadChatInfo(shareId, chatId);
  });

  // load histories
  useQuery(['loadHistories', outLinkUid, shareId], () => {
    if (shareId && outLinkUid) {
      return loadHistories({
        shareId,
        outLinkUid
      });
    }
    return null;
  });

  // window init
  useEffect(() => {
    setIdEmbed(window !== top);
  }, []);

  // todo:4.6.4 init: update local chat history, add outLinkUid
  useEffect(() => {
    const activeHistory = shareChatHistory.filter((item) => !item.delete);
    if (!localUId || !shareId || activeHistory.length === 0) return;
    (async () => {
      try {
        await POST('/core/chat/initLocalShareHistoryV464', {
          shareId,
          outLinkUid: localUId,
          chatIds: shareChatHistory.map((item) => item.chatId)
        });
        clearLocalHistory();
        // router.reload();
      } catch (error) {
        toast({
          status: 'warning',
          title: getErrText(error, t('core.shareChat.Init Error'))
        });
      }
    })();
  }, [clearLocalHistory, localUId, router, shareChatHistory, shareId, t, toast]);

  return (
    <PageContainer
      {...(isEmbed
        ? { p: '0 !important', insertProps: { borderRadius: '0', boxShadow: 'none' } }
        : { p: [0, 5] })}
    >
      <Head>
        <title>{chatData.app.name}</title>
      </Head>
      <MyBox
        isLoading={isFetching}
        h={'100%'}
        display={'flex'}
        flexDirection={['column', 'row']}
        bg={'white'}
      >
        {showHistory === '1'
          ? ((children: React.ReactNode) => {
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
                appName={chatData.app.name}
                appAvatar={chatData.app.avatar}
                activeChatId={chatId}
                history={histories.map((item) => ({
                  id: item.chatId,
                  title: item.title,
                  customTitle: item.customTitle,
                  top: item.top
                }))}
                onClose={onCloseSlider}
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
                onDelHistory={({ chatId }) =>
                  delOneHistory({ appId: chatData.appId, chatId, shareId, outLinkUid })
                }
                onClearHistory={() => {
                  clearHistories({ shareId, outLinkUid });
                  router.replace({
                    query: {
                      ...router.query,
                      chatId: ''
                    }
                  });
                }}
                onSetHistoryTop={(e) => {
                  updateHistory({
                    ...e,
                    appId: chatData.appId,
                    shareId,
                    outLinkUid
                  });
                }}
                onSetCustomTitle={async (e) => {
                  updateHistory({
                    appId: chatData.appId,
                    chatId: e.chatId,
                    title: e.title,
                    customTitle: e.title,
                    shareId,
                    outLinkUid
                  });
                }}
              />
            )
          : null}

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
            showHistory={showHistory === '1'}
            onOpenSlider={onOpenSlider}
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
                delOneHistoryItem({ ...e, appId: chatData.appId, chatId, shareId, outLinkUid })
              }
              appId={chatData.appId}
              chatId={chatId}
              shareId={shareId}
              outLinkUid={outLinkUid}
            />
          </Box>
        </Flex>
      </MyBox>
    </PageContainer>
  );
};

export async function getServerSideProps(context: any) {
  const shareId = context?.query?.shareId || '';
  const chatId = context?.query?.chatId || '';
  const showHistory = context?.query?.showHistory || '1';
  const authToken = context?.query?.authToken || '';

  return {
    props: {
      shareId,
      chatId,
      showHistory,
      authToken,
      ...(await serviceSideProps(context))
    }
  };
}

export default OutLink;
