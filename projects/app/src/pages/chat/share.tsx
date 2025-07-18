import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Flex, Drawer, DrawerOverlay, DrawerContent } from '@chakra-ui/react';
import { streamFetch } from '@/web/common/api/fetch';
import SideBar from '@/components/SideBar';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';

import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';

import PageContainer from '@/components/PageContainer';
import ChatHeader from '@/pageComponents/chat/ChatHeader';
import ChatHistorySlider from '@/pageComponents/chat/ChatHistorySlider';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import { getInitOutLinkChatInfo } from '@/web/core/chat/api';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { addLog } from '@fastgpt/service/common/system/log';

import NextHead from '@/components/common/NextHead';
import { useContextSelector } from 'use-context-selector';
import ChatContextProvider, { ChatContext } from '@/web/core/chat/context/chatContext';
import { GetChatTypeEnum } from '@/global/core/chat/constants';
import { useMount } from 'ahooks';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getNanoid } from '@fastgpt/global/common/string/tools';

import dynamic from 'next/dynamic';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useShareChatStore } from '@/web/core/chat/storeShareChat';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider, {
  ChatRecordContext
} from '@/web/core/chat/context/chatRecordContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { useI18nLng } from '@fastgpt/web/hooks/useI18n';
import { type AppSchema } from '@fastgpt/global/core/app/type';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';

const CustomPluginRunBox = dynamic(() => import('@/pageComponents/chat/CustomPluginRunBox'));

type Props = {
  appId: string;
  appName: string;
  appIntro: string;
  appAvatar: string;
  shareId: string;
  authToken: string;
  customUid: string;
  showRawSource: boolean;
  responseDetail: boolean;
  // showFullText: boolean;
  showNodeStatus: boolean;
};

const OutLink = (props: Props) => {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    shareId = '',
    showHistory = '1',
    showHead = '1',
    authToken,
    customUid,
    ...customVariables
  } = router.query as {
    shareId: string;
    showHistory: '0' | '1';
    showHead: '0' | '1';
    authToken: string;
    [key: string]: string;
  };
  const { isPc } = useSystem();
  const { outLinkAuthData, appId, chatId } = useChatStore();

  const isOpenSlider = useContextSelector(ChatContext, (v) => v.isOpenSlider);
  const onCloseSlider = useContextSelector(ChatContext, (v) => v.onCloseSlider);
  const forbidLoadChat = useContextSelector(ChatContext, (v) => v.forbidLoadChat);
  const onChangeChatId = useContextSelector(ChatContext, (v) => v.onChangeChatId);
  const onUpdateHistoryTitle = useContextSelector(ChatContext, (v) => v.onUpdateHistoryTitle);

  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);
  const isPlugin = useContextSelector(ChatItemContext, (v) => v.isPlugin);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);
  const isResponseDetail = useContextSelector(ChatItemContext, (v) => v.isResponseDetail);

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const totalRecordsCount = useContextSelector(ChatRecordContext, (v) => v.totalRecordsCount);
  const isChatRecordsLoaded = useContextSelector(ChatRecordContext, (v) => v.isChatRecordsLoaded);

  const initSign = useRef(false);
  const { data, loading } = useRequest2(
    async () => {
      const shareId = outLinkAuthData.shareId;
      const outLinkUid = outLinkAuthData.outLinkUid;
      if (!outLinkUid || !shareId || forbidLoadChat.current) return;

      const res = await getInitOutLinkChatInfo({
        chatId,
        shareId,
        outLinkUid
      });

      setChatBoxData(res);

      resetVariables({
        variables: res.variables,
        variableList: res.app?.chatConfig?.variables
      });

      return res;
    },
    {
      manual: false,
      refreshDeps: [shareId, outLinkAuthData, chatId],
      onFinally() {
        forbidLoadChat.current = false;
      }
    }
  );
  useEffect(() => {
    if (initSign.current === false && data && isChatRecordsLoaded) {
      initSign.current = true;
      if (window !== top) {
        window.top?.postMessage({ type: 'shareChatReady' }, '*');
      }
    }
  }, [data, isChatRecordsLoaded]);

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

      const { responseText } = await streamFetch({
        data: {
          messages: histories,
          variables: {
            ...variables,
            ...customVariables
          },
          responseChatItemId,
          chatId: completionChatId,
          ...outLinkAuthData,
          retainDatasetCite: isResponseDetail
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
      setChatBoxData((state) => ({
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

      return { responseText, isNewChat: forbidLoadChat.current };
    },
    [
      chatId,
      customVariables,
      outLinkAuthData,
      isResponseDetail,
      onUpdateHistoryTitle,
      setChatBoxData,
      forbidLoadChat,
      onChangeChatId
    ]
  );

  // window init
  const [isEmbed, setIdEmbed] = useState(true);
  useMount(() => {
    setIdEmbed(window !== top);
  });

  const RenderHistoryList = useMemo(() => {
    const Children = (
      <ChatHistorySlider
        confirmClearText={t('common:core.chat.Confirm to clear share chat history')}
      />
    );

    if (showHistory !== '1') return null;

    return isPc ? (
      <SideBar externalTrigger={!!datasetCiteData}>{Children}</SideBar>
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
  }, [isOpenSlider, isPc, onCloseSlider, datasetCiteData, showHistory, t]);

  return (
    <>
      <NextHead
        title={props.appName || data?.app?.name || 'AI'}
        desc={props.appIntro || data?.app?.intro}
        icon={props.appAvatar || data?.app?.avatar}
      />
      <Flex
        h={'full'}
        gap={4}
        {...(isEmbed ? { p: '0 !important', borderRadius: '0', boxShadow: 'none' } : { p: [0, 5] })}
      >
        {(!datasetCiteData || isPc) && (
          <PageContainer flex={'1 0 0'} w={0} p={'0 !important'}>
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
                    history={chatRecords}
                    totalRecordsCount={totalRecordsCount}
                    showHistory={showHistory === '1'}
                  />
                ) : null}
                {/* chat box */}
                <Box flex={1} bg={'white'}>
                  {isPlugin ? (
                    <CustomPluginRunBox
                      appId={appId}
                      chatId={chatId}
                      outLinkAuthData={outLinkAuthData}
                      onNewChat={() => onChangeChatId(getNanoid())}
                      onStartChat={startChat}
                    />
                  ) : (
                    <ChatBox
                      isReady={!loading}
                      appId={appId}
                      chatId={chatId}
                      outLinkAuthData={outLinkAuthData}
                      feedbackType={'user'}
                      onStartChat={startChat}
                      chatType={ChatTypeEnum.share}
                    />
                  )}
                </Box>
              </Flex>
            </Flex>
          </PageContainer>
        )}

        {datasetCiteData && (
          <PageContainer flex={'1 0 0'} w={0} maxW={'560px'} p={'0 !important'}>
            <ChatQuoteList
              rawSearch={datasetCiteData.rawSearch}
              metadata={datasetCiteData.metadata}
              onClose={() => setCiteModalData(undefined)}
            />
          </PageContainer>
        )}
      </Flex>
    </>
  );
};

const Render = (props: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { shareId, authToken, customUid, appId } = props;
  const { localUId, setLocalUId, loaded } = useShareChatStore();
  const { source, chatId, setSource, setAppId, setOutLinkAuthData } = useChatStore();
  const { setUserDefaultLng } = useI18nLng();

  const chatHistoryProviderParams = useMemo(() => {
    return { shareId, outLinkUid: authToken || customUid || localUId || '' };
  }, [authToken, customUid, localUId, shareId]);
  const chatRecordProviderParams = useMemo(() => {
    return {
      appId,
      shareId,
      outLinkUid: chatHistoryProviderParams.outLinkUid,
      chatId,
      type: GetChatTypeEnum.outLink
    };
  }, [appId, chatHistoryProviderParams.outLinkUid, chatId, shareId]);

  useMount(() => {
    setSource('share');
    setUserDefaultLng(true);
  });

  // Set default localUId
  useEffect(() => {
    if (loaded) {
      if (!localUId) {
        setLocalUId(`shareChat-${Date.now()}-${getNanoid(24)}`);
      }
    }
  }, [loaded, localUId, setLocalUId]);

  // Init outLinkAuthData
  useEffect(() => {
    if (chatHistoryProviderParams.outLinkUid) {
      setOutLinkAuthData({
        shareId,
        outLinkUid: chatHistoryProviderParams.outLinkUid
      });
    }
    return () => {
      setOutLinkAuthData({});
    };
  }, [chatHistoryProviderParams.outLinkUid, setOutLinkAuthData, shareId]);

  // Watch appId
  useEffect(() => {
    setAppId(appId);
  }, [appId, setAppId]);
  useMount(() => {
    if (!appId) {
      toast({
        status: 'warning',
        title: t('chat:invalid_share_url')
      });
    }
  });

  return source === ChatSourceEnum.share ? (
    <ChatContextProvider params={chatHistoryProviderParams}>
      <ChatItemContextProvider
        showRouteToAppDetail={false}
        showRouteToDatasetDetail={false}
        isShowReadRawSource={props.showRawSource}
        isResponseDetail={props.responseDetail}
        // isShowFullText={props.showFullText}
        showNodeStatus={props.showNodeStatus}
      >
        <ChatRecordContextProvider params={chatRecordProviderParams}>
          <OutLink {...props} />
        </ChatRecordContextProvider>
      </ChatItemContextProvider>
    </ChatContextProvider>
  ) : (
    <NextHead title={props.appName} desc={props.appIntro} icon={props.appAvatar} />
  );
};

export default React.memo(Render);

export async function getServerSideProps(context: any) {
  const shareId = context?.query?.shareId || '';
  const authToken = context?.query?.authToken || '';
  const customUid = context?.query?.customUid || '';

  const app = await (async () => {
    try {
      return MongoOutLink.findOne(
        {
          shareId
        },
        'appId showRawSource showNodeStatus responseDetail'
      )
        .populate<{ associatedApp: AppSchema }>('associatedApp', 'name avatar intro')
        .lean();
    } catch (error) {
      addLog.error('getServerSideProps', error);
      return undefined;
    }
  })();

  return {
    props: {
      appId: app?.appId ? String(app?.appId) : '',
      appName: app?.associatedApp?.name ?? 'AI',
      appAvatar: app?.associatedApp?.avatar ?? '',
      appIntro: app?.associatedApp?.intro ?? 'AI',
      showRawSource: app?.showRawSource ?? false,
      responseDetail: app?.responseDetail ?? false,
      // showFullText: app?.showFullText ?? false,
      showNodeStatus: app?.showNodeStatus ?? false,
      shareId: shareId ?? '',
      authToken: authToken ?? '',
      customUid,
      ...(await serviceSideProps(context, ['file', 'app', 'chat', 'workflow']))
    }
  };
}
