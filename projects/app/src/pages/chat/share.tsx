import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Flex, Drawer, DrawerOverlay, DrawerContent } from '@chakra-ui/react';
import { streamFetch } from '@/web/common/api/fetch';
import SideBar from '@/components/SideBar';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';

import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';

import PageContainer from '@/components/PageContainer';
import ChatHeader from './components/ChatHeader';
import ChatHistorySlider from './components/ChatHistorySlider';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useTranslation } from 'next-i18next';
import { delChatRecordById, getInitOutLinkChatInfo } from '@/web/core/chat/api';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { OutLinkWithAppType } from '@fastgpt/global/support/outLink/type';
import { addLog } from '@fastgpt/service/common/system/log';
import { connectToDatabase } from '@/service/mongo';
import NextHead from '@/components/common/NextHead';
import { useContextSelector } from 'use-context-selector';
import ChatContextProvider, { ChatContext } from '@/web/core/chat/context/chatContext';
import { InitChatResponse } from '@/global/core/chat/api';
import { defaultChatData, GetChatTypeEnum } from '@/global/core/chat/constants';
import { useMount } from 'ahooks';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useChat } from '@/components/core/chat/ChatContainer/useChat';
import { getNanoid } from '@fastgpt/global/common/string/tools';

import dynamic from 'next/dynamic';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useShareChatStore } from '@/web/core/chat/storeShareChat';
const CustomPluginRunBox = dynamic(() => import('./components/CustomPluginRunBox'));

type Props = {
  appName: string;
  appIntro: string;
  appAvatar: string;
  shareId: string;
  authToken: string;
  customUid: string;
  showRawSource: boolean;
  showNodeStatus: boolean;
};

const OutLink = (
  props: Props & {
    outLinkUid: string;
  }
) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { outLinkUid, showRawSource, showNodeStatus } = props;
  const {
    shareId = '',
    chatId = '',
    showHistory = '1',
    showHead = '1',
    authToken,
    customUid,
    ...customVariables
  } = router.query as {
    shareId: string;
    chatId: string;
    showHistory: '0' | '1';
    showHead: '0' | '1';
    authToken: string;
    [key: string]: string;
  };
  const { isPc } = useSystem();
  const initSign = useRef(false);
  const [isEmbed, setIdEmbed] = useState(true);

  const [chatData, setChatData] = useState<InitChatResponse>(defaultChatData);

  const {
    onUpdateHistoryTitle,
    onUpdateHistory,
    onClearHistories,
    onDelHistory,
    isOpenSlider,
    onCloseSlider,
    forbidLoadChat,
    onChangeChatId
  } = useContextSelector(ChatContext, (v) => v);

  const params = useMemo(() => {
    return {
      chatId,
      shareId,
      outLinkUid,
      appId: chatData.appId,
      type: GetChatTypeEnum.outLink
    };
  }, [chatData.appId, chatId, outLinkUid, shareId]);
  const {
    ChatBoxRef,
    variablesForm,
    pluginRunTab,
    setPluginRunTab,
    resetVariables,
    chatRecords,
    ScrollData,
    setChatRecords,
    totalRecordsCount
  } = useChat(params);

  const startChat = useCallback(
    async ({
      messages,
      controller,
      generatingMessage,
      variables,
      responseChatItemId
    }: StartChatFnProps) => {
      const completionChatId = chatId || getNanoid();
      const histories = messages.slice(-1);

      //post message to report chat start
      window.top?.postMessage(
        {
          type: 'shareChatStart',
          data: {
            question: histories[0]?.content
          }
        },
        '*'
      );

      const { responseText, responseData } = await streamFetch({
        data: {
          messages: histories,
          variables: {
            ...variables,
            ...customVariables
          },
          responseChatItemId,
          shareId,
          chatId: completionChatId,
          appType: chatData.app.type,
          outLinkUid
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      const newTitle = getChatTitleFromChatMessage(GPTMessages2Chats(histories)[0]);

      // new chat
      if (completionChatId !== chatId) {
        onChangeChatId(completionChatId, true);
      }
      onUpdateHistoryTitle({ chatId: completionChatId, newTitle });

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
            question: histories[0]?.content,
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
      chatData.app.type,
      outLinkUid,
      onUpdateHistoryTitle,
      forbidLoadChat,
      onChangeChatId
    ]
  );

  const { loading: isLoading } = useRequest2(
    async () => {
      if (!shareId || !outLinkUid || forbidLoadChat.current) return;

      const res = await getInitOutLinkChatInfo({
        chatId,
        shareId,
        outLinkUid
      });
      setChatData(res);

      resetVariables({
        variables: res.variables
      });
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

  const RenderHistoryList = useMemo(() => {
    const Children = (
      <ChatHistorySlider
        appName={chatData.app.name}
        appAvatar={chatData.app.avatar}
        confirmClearText={t('common:core.chat.Confirm to clear share chat history')}
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
    );

    if (showHistory !== '1') return null;

    return isPc ? (
      <SideBar>{Children}</SideBar>
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
          {Children}
        </DrawerContent>
      </Drawer>
    );
  }, [
    chatData.app.avatar,
    chatData.app.name,
    chatData.appId,
    isOpenSlider,
    isPc,
    onClearHistories,
    onCloseSlider,
    onDelHistory,
    onUpdateHistory,
    outLinkUid,
    shareId,
    showHistory,
    t
  ]);

  const loading = isLoading;

  return (
    <>
      <NextHead title={props.appName || 'AI'} desc={props.appIntro} icon={props.appAvatar} />
      <PageContainer
        isLoading={loading}
        {...(isEmbed
          ? { p: '0 !important', insertProps: { borderRadius: '0', boxShadow: 'none' } }
          : { p: [0, 5] })}
      >
        <Flex h={'100%'} flexDirection={['column', 'row']}>
          {RenderHistoryList}

          {/* chat container */}
          <Flex
            position={'relative'}
            h={[0, '100%']}
            w={['100%', 0]}
            flex={'1 0 0'}
            flexDirection={'column'}
          >
            {/* header */}
            {showHead === '1' ? (
              <ChatHeader
                chatData={chatData}
                history={chatRecords}
                totalRecordsCount={totalRecordsCount}
                showHistory={showHistory === '1'}
              />
            ) : null}
            {/* chat box */}
            <Box flex={1} bg={'white'}>
              {chatData.app.type === AppTypeEnum.plugin ? (
                <CustomPluginRunBox
                  pluginInputs={chatData.app.pluginInputs}
                  variablesForm={variablesForm}
                  histories={chatRecords}
                  setHistories={setChatRecords}
                  appId={chatData.appId}
                  tab={pluginRunTab}
                  setTab={setPluginRunTab}
                  onNewChat={() => onChangeChatId(getNanoid())}
                  onStartChat={startChat}
                />
              ) : (
                <ChatBox
                  ScrollData={ScrollData}
                  ref={ChatBoxRef}
                  chatHistories={chatRecords}
                  setChatHistories={setChatRecords}
                  variablesForm={variablesForm}
                  appAvatar={chatData.app.avatar}
                  userAvatar={chatData.userAvatar}
                  chatConfig={chatData.app?.chatConfig}
                  feedbackType={'user'}
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
                  chatType="share"
                  showRawSource={showRawSource}
                  showNodeStatus={showNodeStatus}
                />
              )}
            </Box>
          </Flex>
        </Flex>
      </PageContainer>
    </>
  );
};

const Render = (props: Props) => {
  const { shareId, authToken, customUid } = props;
  const { localUId, loaded } = useShareChatStore();
  const [isLoaded, setIsLoaded] = useState(false);

  const contextParams = useMemo(() => {
    return { shareId, outLinkUid: authToken || localUId || customUid };
  }, [authToken, customUid, localUId, shareId]);

  useMount(() => {
    setIsLoaded(true);
  });
  const systemLoaded = isLoaded && loaded && contextParams.outLinkUid;

  return (
    <>
      {systemLoaded ? (
        <ChatContextProvider params={contextParams}>
          <OutLink {...props} outLinkUid={contextParams.outLinkUid} />;
        </ChatContextProvider>
      ) : (
        <NextHead title="Loading..." />
      )}
    </>
  );
};

export default React.memo(Render);

export async function getServerSideProps(context: any) {
  const shareId = context?.query?.shareId || '';
  const authToken = context?.query?.authToken || '';
  const customUid = context?.query?.customUid || '';

  const app = await (async () => {
    try {
      await connectToDatabase();
      const app = (await MongoOutLink.findOne(
        {
          shareId
        },
        'appId showRawSource showNodeStatus'
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
      appName: app?.appId?.name ?? 'AI',
      appAvatar: app?.appId?.avatar ?? '',
      appIntro: app?.appId?.intro ?? 'AI',
      showRawSource: app?.showRawSource ?? false,
      showNodeStatus: app?.showNodeStatus ?? false,
      shareId: shareId ?? '',
      authToken: authToken ?? '',
      customUid,
      ...(await serviceSideProps(context, ['file', 'app', 'chat', 'workflow']))
    }
  };
}
