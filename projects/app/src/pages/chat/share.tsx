import React, { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Flex, Drawer, DrawerOverlay, DrawerContent } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { streamFetch } from '@/web/common/api/fetch';
import { useShareChatStore } from '@/web/core/chat/storeShareChat';
import SideBar from '@/components/SideBar';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { getErrText } from '@fastgpt/global/common/error/utils';
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
import { delChatRecordById, getChatHistories, getInitOutLinkChatInfo } from '@/web/core/chat/api';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { OutLinkWithAppType } from '@fastgpt/global/support/outLink/type';
import { addLog } from '@fastgpt/service/common/system/log';
import { connectToDatabase } from '@/service/mongo';
import NextHead from '@/components/common/NextHead';
import { useContextSelector } from 'use-context-selector';
import ChatContextProvider, { ChatContext } from '@/web/core/chat/context/chatContext';
import { InitChatResponse } from '@/global/core/chat/api';
import { defaultChatData } from '@/global/core/chat/constants';
import { useMount } from 'ahooks';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

type Props = {
  appName: string;
  appIntro: string;
  appAvatar: string;
  shareId: string;
  authToken: string;
};

const OutLink = ({ appName, appIntro, appAvatar }: Props) => {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    shareId = '',
    chatId = '',
    showHistory = '1',
    showHead = '1',
    authToken,
    ...customVariables
  } = router.query as {
    shareId: string;
    chatId: string;
    showHistory: '0' | '1';
    showHead: '0' | '1',
    authToken: string;
    [key: string]: string;
  };
  const { toast } = useToast();
  const { isPc } = useSystemStore();
  const ChatBoxRef = useRef<ComponentRef>(null);
  const initSign = useRef(false);
  const [isEmbed, setIdEmbed] = useState(true);

  const [chatData, setChatData] = useState<InitChatResponse>(defaultChatData);
  const appId = chatData.appId;

  const { localUId } = useShareChatStore();
  const outLinkUid: string = authToken || localUId;

  const {
    loadHistories,
    onUpdateHistory,
    onClearHistories,
    onDelHistory,
    isOpenSlider,
    onCloseSlider,
    forbidLoadChat,
    onChangeChatId
  } = useContextSelector(ChatContext, (v) => v);

  const startChat = useCallback(
    async ({ messages, controller, generatingMessage, variables }: StartChatFnProps) => {
      const prompts = messages.slice(-2);
      const completionChatId = chatId ? chatId : nanoid();

      //post message to report chat start
      window.top?.postMessage(
        {
          type: 'shareChatStart',
          data: {
            question: prompts[0]?.content
          }
        },
        '*'
      );

      const { responseText, responseData } = await streamFetch({
        data: {
          messages: prompts,
          variables: {
            ...variables,
            ...customVariables
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
        onChangeChatId(completionChatId, true);
        loadHistories();
      } else {
        // update chat
        onUpdateHistory({
          appId,
          chatId: completionChatId,
          title: newTitle,
          shareId,
          outLinkUid
        });
      }

      // update chat window
      setChatData((state) => ({
        ...state,
        title: newTitle
      }));

      // hook message
      window.top?.postMessage(
        {
          type: 'shareChatFinish',
          data: {
            question: prompts[0]?.content,
            answer: responseText
          }
        },
        '*'
      );

      return { responseText, responseData, isNewChat: forbidLoadChat.current };
    },
    [
      chatId,
      customVariables,
      shareId,
      outLinkUid,
      forbidLoadChat,
      onChangeChatId,
      loadHistories,
      onUpdateHistory,
      appId
    ]
  );

  const { loading } = useRequest2(
    async () => {
      if (!shareId || !outLinkUid || forbidLoadChat.current) return;

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
      const result: InitChatResponse = {
        ...res,
        history
      };

      // reset chat box
      ChatBoxRef.current?.resetHistory(history);
      ChatBoxRef.current?.resetVariables(res.variables);
      if (history.length > 0) {
        setTimeout(() => {
          ChatBoxRef.current?.scrollToBottom('auto');
        }, 500);
      }

      setChatData(result);
    },
    {
      manual: false,
      refreshDeps: [shareId, outLinkUid, chatId],
      onSuccess() {
        // send init message
        if (!initSign.current) {
          initSign.current = true;
          if (window !== top) {
            window.top?.postMessage({ type: 'shareChatReady' }, '*');
          }
        }
      },
      onError(e: any) {
        console.log(e);
        toast({
          status: 'error',
          title: getErrText(e, t('core.shareChat.Init Error'))
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

  // window init
  useMount(() => {
    setIdEmbed(window !== top);
  });

  return (
    <>
      <NextHead title={appName} desc={appIntro} icon={appAvatar} />

      <PageContainer
        isLoading={loading}
        {...(isEmbed
          ? { p: '0 !important', insertProps: { borderRadius: '0', boxShadow: 'none' } }
          : { p: [0, 5] })}
      >
        <Flex h={'100%'} flexDirection={['column', 'row']} bg={'white'}>
          {showHistory === '1' &&
            ((children: React.ReactNode) => {
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
                  <DrawerContent maxWidth={'75vw'} boxShadow={'2px 0 10px rgba(0,0,0,0.15)'}>
                    {children}
                  </DrawerContent>
                </Drawer>
              );
            })(
              <ChatHistorySlider
                appName={chatData.app.name}
                appAvatar={chatData.app.avatar}
                confirmClearText={t('core.chat.Confirm to clear share chat history')}
                onDelHistory={({ chatId }) =>
                  onDelHistory({ appId: chatData.appId, chatId, shareId, outLinkUid })
                }
                onClearHistory={() => {
                  onClearHistories({ shareId, outLinkUid });
                }}
                onSetHistoryTop={(e) => {
                  onUpdateHistory({
                    ...e,
                    appId: chatData.appId,
                    shareId,
                    outLinkUid
                  });
                }}
                onSetCustomTitle={(e) => {
                  onUpdateHistory({
                    appId: chatData.appId,
                    chatId: e.chatId,
                    customTitle: e.title,
                    shareId,
                    outLinkUid
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
            {showHead === "1" ? (
              <ChatHeader
              appAvatar={chatData.app.avatar}
              appName={chatData.app.name}
              history={chatData.history}
              showHistory={showHistory === '1'}
            />
            ) : (
              null
            )}
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
                  delChatRecordById({
                    contentId,
                    appId: chatData.appId,
                    chatId,
                    shareId,
                    outLinkUid
                  })
                }
                appId={chatData.appId}
                chatId={chatId}
                shareId={shareId}
                outLinkUid={outLinkUid}
              />
            </Box>
          </Flex>
        </Flex>
      </PageContainer>
    </>
  );
};

const Render = (props: Props) => {
  const { shareId, authToken } = props;
  const { localUId } = useShareChatStore();
  const outLinkUid: string = authToken || localUId;

  const { data: histories = [], runAsync: loadHistories } = useRequest2(
    () => (shareId && outLinkUid ? getChatHistories({ shareId, outLinkUid }) : Promise.resolve([])),
    {
      manual: false,
      refreshDeps: [shareId, outLinkUid]
    }
  );

  return (
    <ChatContextProvider histories={histories} loadHistories={loadHistories}>
      <OutLink {...props} />;
    </ChatContextProvider>
  );
};

export default Render;

export async function getServerSideProps(context: any) {
  const shareId = context?.query?.shareId || '';
  const authToken = context?.query?.authToken || '';

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
      appName: app?.appId?.name ?? 'name',
      appAvatar: app?.appId?.avatar ?? '',
      appIntro: app?.appId?.intro ?? 'intro',
      shareId: shareId ?? '',
      authToken: authToken ?? '',
      ...(await serviceSideProps(context, ['file']))
    }
  };
}
