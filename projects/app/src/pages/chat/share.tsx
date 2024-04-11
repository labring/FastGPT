import React, { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Box, Flex, useDisclosure, Drawer, DrawerOverlay, DrawerContent } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useQuery } from '@tanstack/react-query';
import { streamFetch } from '@/web/common/api/fetch';
import { useShareChatStore } from '@/web/core/chat/storeShareChat';
import SideBar from '@/components/SideBar';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { ChatHistoryItemType, ChatSiteItemType } from '@fastgpt/global/core/chat/type.d';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

import ChatBox from '@/components/ChatBox';
import type { ComponentRef, StartChatFnProps } from '@/components/ChatBox/type.d';
import PageContainer from '@/components/PageContainer';
import ChatHeader from './components/ChatHeader';
import ChatHistorySlider from './components/ChatHistorySlider';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { checkChatSupportSelectFileByChatModels } from '@/web/core/chat/utils';
import { useTranslation } from 'next-i18next';
import { getInitOutLinkChatInfo } from '@/web/core/chat/api';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { useChatStore } from '@/web/core/chat/storeChat';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import MyBox from '@/components/common/MyBox';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { OutLinkWithAppType } from '@fastgpt/global/support/outLink/type';
import { addLog } from '@fastgpt/service/common/system/log';
import { connectToDatabase } from '@/service/mongo';

const OutLink = ({
  appName,
  appIntro,
  appAvatar
}: {
  appName?: string;
  appIntro?: string;
  appAvatar?: string;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    shareId = '',
    chatId = '',
    showHistory = '1',
    authToken,
    ...customVariables
  } = router.query as {
    shareId: string;
    chatId: string;
    showHistory: '0' | '1';
    authToken: string;
    [key: string]: string;
  };
  const { toast } = useToast();
  const { isOpen: isOpenSlider, onClose: onCloseSlider, onOpen: onOpenSlider } = useDisclosure();
  const { isPc } = useSystemStore();
  const ChatBoxRef = useRef<ComponentRef>(null);
  const forbidRefresh = useRef(false);
  const initSign = useRef(false);
  const [isEmbed, setIdEmbed] = useState(true);

  const { localUId } = useShareChatStore();
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
          variables: {
            ...customVariables,
            ...variables
          },
          shareId,
          chatId: completionChatId,
          outLinkUid
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
      const result: ChatSiteItemType[] = GPTMessages2Chats(prompts).map((item) => ({
        ...item,
        dataId: item.dataId || nanoid(),
        status: 'finish'
      }));

      window.top?.postMessage(
        {
          type: 'shareChatFinish',
          data: {
            question: result[0]?.value,
            answer: responseText
          }
        },
        '*'
      );

      return { responseText, responseData, isNewChat: forbidRefresh.current };
    },
    [
      chatId,
      customVariables,
      shareId,
      outLinkUid,
      setChatData,
      appId,
      pushHistory,
      router,
      histories,
      updateHistory
    ]
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
          dataId: item.dataId || nanoid(),
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

  return (
    <PageContainer
      {...(isEmbed
        ? { p: '0 !important', insertProps: { borderRadius: '0', boxShadow: 'none' } }
        : { p: [0, 5] })}
    >
      <Head>
        <title>{appName || chatData.app?.name}</title>
        <meta name="description" content={appIntro} />
        <link rel="icon" href={appAvatar || chatData.app?.avatar} />
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
                confirmClearText={t('core.chat.Confirm to clear share chat history')}
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

  const app = await (async () => {
    try {
      await connectToDatabase();
      const app = (await MongoOutLink.findOne(
        {
          shareId
        },
        'appId'
      )
        .populate('appId', 'name avatar intro')
        .lean()) as OutLinkWithAppType;
      return app;
    } catch (error) {
      addLog.error('getServerSideProps', error);
      return undefined;
    }
  })();

  return {
    props: {
      appName: app?.appId?.name || '',
      appAvatar: app?.appId?.avatar || '',
      appIntro: app?.appId?.intro || '',
      ...(await serviceSideProps(context))
    }
  };
}

export default OutLink;
