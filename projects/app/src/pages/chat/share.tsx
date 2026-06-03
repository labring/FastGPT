import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Flex } from '@chakra-ui/react';
import { streamFetch } from '@/web/common/api/fetch';
import SideBar from '@/components/SideBar';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';

import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';

import PageContainer from '@/components/PageContainer';
import ChatHeader from '@/pageComponents/chat/ChatHeader';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import { getInitOutLinkChatInfo } from '@/web/core/chat/api';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

import NextHead from '@/components/common/NextHead';
import { useContextSelector } from 'use-context-selector';
import ChatContextProvider, { ChatContext } from '@/web/core/chat/context/chatContext';
import { GetChatTypeEnum } from '@fastgpt/global/core/chat/constants';
import { useMount } from 'ahooks';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
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
import { type AppSchemaType } from '@fastgpt/global/core/app/type';
import QuoteReader from '@/pageComponents/chat/ChatQuoteList/QuoteReader';
import ReferencePanel from '@/pageComponents/chat/ChatQuoteList/ReferencePanel';
import ResizableDivider from '@/components/common/ResizableDivider';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import ChatHistorySidebar from '@/pageComponents/chat/slider/ChatSliderSidebar';
import ChatSliderMobileDrawer from '@/pageComponents/chat/slider/ChatSliderMobileDrawer';
import { getInitChatInfo } from '@/web/core/chat/api';
import LoginModal from '@/pageComponents/login/LoginModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getTokenLogin } from '@/web/support/user/api';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';

const logger = getLogger(LogCategories.MODULE.CHAT.ITEM);

const CustomPluginRunBox = dynamic(() => import('@/pageComponents/chat/CustomPluginRunBox'));

type Props = {
  appId: string;
  appName: string;
  appIntro: string;
  appAvatar: string;
  shareId: string;
  teamId: string;
  authToken: string;
  customUid: string;
  canDownloadSource: boolean;
  isShowCite: boolean;
  isShowFullText: boolean;
  showRunningStatus: boolean;
  showSkillReferences: boolean;
  allowAnonymous?: boolean;
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
    showWorkorder,
    hideMenu = '0',
    ...customVariables
  } = router.query as {
    shareId: string;
    showHistory: '0' | '1';
    showHead: '0' | '1';
    authToken: string;
    showWorkorder: '0' | '1';
    hideMenu: '0' | '1';
    [key: string]: string;
  };
  const { isPc } = useSystem();
  const { outLinkAuthData, appId, chatId } = useChatStore();

  const [referencePanelWidth, setReferencePanelWidth] = useState(580);
  const [sidebarWidth, setSidebarWidth] = useState(250);

  // Remove empty value field
  const formatedCustomVariables = useMemo(() => {
    return Object.fromEntries(Object.entries(customVariables).filter(([_, value]) => value !== ''));
  }, [customVariables]);

  const forbidLoadChat = useContextSelector(ChatContext, (v) => v.forbidLoadChat);
  const forbidLoadChatMap = useContextSelector(ChatContext, (v) => v.forbidLoadChatMap);
  const onChangeChatId = useContextSelector(ChatContext, (v) => v.onChangeChatId);
  const onUpdateHistoryTitle = useContextSelector(ChatContext, (v) => v.onUpdateHistoryTitle);
  const histories = useContextSelector(ChatContext, (v) => v.histories);

  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);
  const isPlugin = useContextSelector(ChatItemContext, (v) => v.isPlugin);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);
  const handleCloseCiteModal = useCallback(() => setCiteModalData(undefined), [setCiteModalData]);
  const isShowCite = useContextSelector(ChatItemContext, (v) => v.isShowCite);
  const isNoneWelcomeAndVariable = useContextSelector(
    ChatItemContext,
    (v) => v.isNoneWelcomeAndVariable
  );

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const totalRecordsCount = useContextSelector(ChatRecordContext, (v) => v.totalRecordsCount);
  const isChatRecordsLoaded = useContextSelector(ChatRecordContext, (v) => v.isChatRecordsLoaded);

  const chatBoxData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);

  const isShowHeader = useMemo(
    () =>
      (!isNoneWelcomeAndVariable || (isChatRecordsLoaded && chatRecords.length !== 0)) &&
      showHead === '1',
    [chatBoxData, isChatRecordsLoaded, chatRecords, showHead]
  );

  const initSign = useRef(false);
  const { data, loading } = useRequest(
    async () => {
      const shareId = outLinkAuthData.shareId;
      const outLinkUid = outLinkAuthData.outLinkUid;
      // 使用 chatId 级别的禁止加载标记
      if (!outLinkUid || !shareId || forbidLoadChatMap.current.get(chatId)) return;

      const res = await getInitOutLinkChatInfo({
        chatId,
        shareId,
        outLinkUid
      });

      setChatBoxData(res);

      resetVariables({
        variables: {
          ...formatedCustomVariables,
          ...res.variables
        },
        variableList: res.app?.chatConfig?.variables
      });

      return res;
    },
    {
      manual: false,
      refreshDeps: [shareId, outLinkAuthData, chatId],
      onFinally() {
        // 清除当前 chatId 的禁止加载标记
        forbidLoadChatMap.current.delete(chatId);
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
      const histories_messages = messages.slice(-1);

      const isNewChat = !histories.find((h) => h.chatId === completionChatId);

      if (isNewChat && completionChatId) {
        forbidLoadChatMap.current.set(completionChatId, true);
        forbidLoadChat.current = true;
      }

      //post message to report chat start
      window.top?.postMessage(
        {
          type: 'shareChatStart',
          data: {
            question: histories_messages[0]?.content
          }
        },
        '*'
      );

      const { responseText } = await streamFetch({
        data: {
          messages: histories_messages,
          variables: {
            ...variables,
            ...customVariables
          },
          responseChatItemId,
          chatId: completionChatId,
          ...outLinkAuthData,
          retainDatasetCite: isShowCite,
          showSkillReferences: props.showSkillReferences
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      // new chat
      if (completionChatId !== chatId) {
        onChangeChatId(completionChatId, true);
      }

      const newTitle = getChatTitleFromChatMessage(
        GPTMessages2Chats({ messages: histories_messages })[0]
      );

      onUpdateHistoryTitle({ chatId: completionChatId, newTitle });
      setChatBoxData((state) => ({
        ...state,
        title: newTitle
      }));

      // hook message
      window.top?.postMessage(
        {
          type: 'shareChatFinish',
          data: {
            question: histories_messages[0]?.content,
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
      isShowCite,
      props.showSkillReferences,
      onUpdateHistoryTitle,
      setChatBoxData,
      forbidLoadChat,
      onChangeChatId,
      histories,
      appId
    ]
  );

  // window init
  const [isEmbed, setIdEmbed] = useState(true);
  useMount(() => {
    setIdEmbed(window !== top);
  });

  const historySidebarChildren = useMemo(
    () => (
      <ChatHistorySidebar
        menuConfirmButtonText={t('chat:confirm_to_clear_share_chat_history')}
        isShareMode={true}
      />
    ),
    [t]
  );

  const RenderHistoryList = useMemo(() => {
    if (showHistory !== '1') return null;

    return !isPc ? (
      <ChatSliderMobileDrawer
        showHeader={false}
        showFooter={false}
        menuConfirmButtonText={t('common:core.chat.Confirm to clear history')}
      />
    ) : null;
  }, [isPc, showHistory, t]);

  return (
    <>
      <NextHead
        title={props.appName || data?.app?.name || 'AI'}
        desc={props.appIntro || data?.app?.intro}
        icon={props.appAvatar || data?.app?.avatar}
      />
      <Flex h={'full'} p={'0 !important'} borderRadius={'0'} boxShadow={'none'}>
        {/* PC Sidebar with resizable divider */}
        {isPc && showHistory === '1' && (
          <>
            <SideBar
              w={[
                '100%',
                `0 0 ${sidebarWidth}px`,
                `0 0 ${sidebarWidth}px`,
                `0 0 ${sidebarWidth}px`,
                `0 0 ${sidebarWidth}px`
              ]}
              externalTrigger={!!datasetCiteData}
            >
              {historySidebarChildren}
            </SideBar>
            <ResizableDivider
              minWidth={180}
              maxWidth={350}
              defaultWidth={250}
              direction="left"
              onResize={setSidebarWidth}
            />
          </>
        )}

        {(!datasetCiteData || isPc) && (
          <PageContainer
            flex={'1 0 0'}
            w={0}
            p={'0 !important'}
            insertProps={{ borderRadius: '0' }}
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
                {isShowHeader ? (
                  <ChatHeader
                    chatSettings={undefined}
                    pane={ChatSidebarPaneEnum.RECENTLY_USED_APPS}
                    history={chatRecords}
                    totalRecordsCount={totalRecordsCount}
                    showHistory={showHistory === '1'}
                    reserveSpace={showWorkorder !== undefined}
                    hideMenu={hideMenu === '1'}
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
                      enableAutoResume
                      feedbackType={'user'}
                      onStartChat={startChat}
                      chatType={ChatTypeEnum.share}
                      showWorkorder={showWorkorder === '1'}
                    />
                  )}
                </Box>
              </Flex>
            </Flex>
          </PageContainer>
        )}

        {datasetCiteData && isPc && (
          <>
            <ResizableDivider
              minWidth={400}
              maxWidth={900}
              defaultWidth={580}
              onResize={setReferencePanelWidth}
            />
            <Box w={`${referencePanelWidth}px`} flexShrink={0} h={'full'} overflow={'hidden'}>
              {'collectionId' in datasetCiteData.metadata ? (
                <ReferencePanel
                  rawSearch={datasetCiteData.rawSearch}
                  metadata={datasetCiteData.metadata}
                  onClose={handleCloseCiteModal}
                />
              ) : (
                <QuoteReader
                  rawSearch={datasetCiteData.rawSearch}
                  metadata={datasetCiteData.metadata}
                  onClose={handleCloseCiteModal}
                />
              )}
            </Box>
          </>
        )}
        {datasetCiteData && !isPc && (
          <PageContainer flex={'1 0 0'} w={0} maxW={'560px'} p={'0 !important'}>
            {'collectionId' in datasetCiteData.metadata ? (
              <ReferencePanel
                rawSearch={datasetCiteData.rawSearch}
                metadata={datasetCiteData.metadata}
                onClose={handleCloseCiteModal}
              />
            ) : (
              <QuoteReader
                rawSearch={datasetCiteData.rawSearch}
                metadata={datasetCiteData.metadata}
                onClose={handleCloseCiteModal}
              />
            )}
          </PageContainer>
        )}
      </Flex>
    </>
  );
};

const Render = (props: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { shareId, authToken, customUid, appId, allowAnonymous, teamId } = props;
  const { localUId, setLocalUId, loaded } = useShareChatStore();
  const { source, chatId, setSource, setAppId, setOutLinkAuthData } = useChatStore();
  const { setUserDefaultLng } = useI18nLng();

  // 确认状态管理
  const [isConfirmed, setIsConfirmed] = useState(() => {
    // 如果允许匿名访问，默认为已确认
    return allowAnonymous !== false;
  });

  const chatHistoryProviderParams = useMemoEnhance(() => {
    return { shareId, outLinkUid: authToken || customUid || localUId || '' };
  }, [authToken, customUid, localUId, shareId]);
  const chatRecordProviderParams = useMemoEnhance(() => {
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
  const { feConfigs } = useSystemStore();
  // 自动登录检查组件
  const AutoLoginChecker = () => {
    const [isChecking, setIsChecking] = useState(true);
    const [showLoginModal, setShowLoginModal] = useState(false);

    const checkAutoLogin = async () => {
      try {
        // 1. 尝试通过 tokenLogin 自动登录
        await getTokenLogin();

        // 2. 登录成功，验证应用权限
        await getInitChatInfo({ appId, chatId: getNanoid() });

        setIsConfirmed(true);
      } catch (error: any) {
        if (error?.code && error.code >= 502000) {
          // 已登录但无应用权限，显示错误信息
          toast({ title: t('chat:no_auth_to_chat'), status: 'error' });
        }
        // 显示登录页面（允许切换账号或首次登录）
        setShowLoginModal(true);
      } finally {
        setIsChecking(false);
      }
    };

    useEffect(() => {
      checkAutoLogin();
    }, []);

    const handleLoginSuccess = async () => {
      try {
        // 验证应用权限
        await getInitChatInfo({ appId, chatId: getNanoid() });
        setIsConfirmed(true);
        return true;
      } catch (e: any) {
        if (e?.code && e.code >= 502000) {
          toast({ title: t('chat:no_auth_to_chat'), status: 'error' });
        } else {
          toast({ title: t('login:login_failed'), status: 'error' });
        }
        return false;
      }
    };

    if (isChecking) {
      return (
        <>
          <NextHead title={feConfigs?.systemTitle} />
          <MyBox
            display="flex"
            justifyContent="center"
            alignItems="center"
            h="100vh"
            isLoading={isChecking}
          ></MyBox>
        </>
      );
    }

    if (showLoginModal) {
      return (
        <>
          <NextHead title={feConfigs?.systemTitle} />
          <LoginModal onSuccess={handleLoginSuccess} teamId={teamId} />
        </>
      );
    }

    return null;
  };

  // 当不允许匿名访问且未确认时，显示自动登录检查组件
  if (allowAnonymous === false && !isConfirmed) {
    return <AutoLoginChecker />;
  }

  return source === ChatSourceEnum.share && chatHistoryProviderParams.outLinkUid ? (
    <ChatContextProvider params={chatHistoryProviderParams}>
      <ChatItemContextProvider
        showRouteToDatasetDetail={false}
        showWholeResponse={false}
        canDownloadSource={props.canDownloadSource}
        isShowCite={props.isShowCite}
        isShowFullText={props.isShowFullText}
        showRunningStatus={props.showRunningStatus}
        showSkillReferences={props.showSkillReferences}
        chatType={ChatTypeEnum.share}
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
        'appId teamId canDownloadSource showCite showFullText showRunningStatus showSkillReferences allowAnonymous'
      )
        .populate<{ associatedApp: AppSchemaType }>('associatedApp', 'name avatar intro')
        .lean();
    } catch (error) {
      logger.error('getServerSideProps failed', {
        error,
        shareId
      });
      return undefined;
    }
  })();

  return {
    props: {
      appId: app?.appId ? String(app?.appId) : '',
      appName: app?.associatedApp?.name ?? 'AI',
      appAvatar: app?.associatedApp?.avatar ?? '',
      appIntro: app?.associatedApp?.intro ?? 'AI',
      canDownloadSource: app?.canDownloadSource ?? true,
      isShowCite: app?.showCite ?? false,
      isShowFullText: app?.showFullText ?? false,
      showRunningStatus: app?.showRunningStatus ?? false,
      showSkillReferences: app?.showSkillReferences ?? false,
      shareId: shareId ?? '',
      teamId: app?.teamId ? String(app.teamId) : '',
      authToken: authToken ?? '',
      allowAnonymous: app?.allowAnonymous ?? true,
      customUid,
      ...(await serviceSideProps(context, [
        'file',
        'app',
        'chat',
        'workflow',
        'login',
        'database_client',
        'sangfor',
        'user',
        'dashboard_evaluation',
        'dataset'
      ]))
    }
  };
}
