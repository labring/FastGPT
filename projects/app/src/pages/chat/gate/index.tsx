import React, { useCallback, useEffect, useMemo, useState } from 'react';
import NextHead from '@/components/common/NextHead';
import { useRouter } from 'next/router';
import { getInitChatInfo } from '@/web/core/chat/api';
import {
  Box,
  Flex,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  Button,
  useDisclosure
} from '@chakra-ui/react';
import { streamFetch } from '@/web/common/api/fetch';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';

import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import PageContainer from '@/components/PageContainer';
import SideBar from '@/components/SideBar';
import ChatHistorySlider from '@/pageComponents/chat/ChatHistorySlider';
import { useUserStore } from '@/web/support/user/useUserStore';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { getMyApps, getMyAppsGate } from '@/web/core/app/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

import { useMount } from 'ahooks';
import { getNanoid } from '@fastgpt/global/common/string/tools';

import { GetChatTypeEnum } from '@/global/core/chat/constants';
import ChatContextProvider, { ChatContext } from '@/web/core/chat/context/chatContext';
import { AppListItemType, AppSchema, AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { useContextSelector } from 'use-context-selector';
import dynamic from 'next/dynamic';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import GateSideBar from '../../../pageComponents/chat/gatechat/GateSideBar';
import { useGateStore } from '@/web/support/user/team/gate/useGateStore';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getDefaultAppForm, appWorkflow2Form } from '@fastgpt/global/core/app/utils';
import { AppContext } from '@/pageComponents/app/detail/context';

const CustomPluginRunBox = dynamic(() => import('@/pageComponents/chat/CustomPluginRunBox'));
const ChatTest = dynamic(() => import('@/pageComponents/app/detail/Gate/ChatTest'));

// AppForm共享上下文
export const AppFormContext = React.createContext<{
  appForm: AppSimpleEditFormType;
  setAppForm: React.Dispatch<React.SetStateAction<AppSimpleEditFormType>>;
}>({
  appForm: getDefaultAppForm(),
  setAppForm: () => {}
});

const Chat = ({ myApps }: { myApps: AppListItemType[] }) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { isPc } = useSystem();

  const { userInfo } = useUserStore();
  const { setLastChatAppId, chatId, appId, outLinkAuthData } = useChatStore();

  const isOpenSlider = useContextSelector(ChatContext, (v) => v.isOpenSlider);
  const onCloseSlider = useContextSelector(ChatContext, (v) => v.onCloseSlider);
  const forbidLoadChat = useContextSelector(ChatContext, (v) => v.forbidLoadChat);
  const onChangeChatId = useContextSelector(ChatContext, (v) => v.onChangeChatId);
  const onUpdateHistoryTitle = useContextSelector(ChatContext, (v) => v.onUpdateHistoryTitle);

  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);
  const isPlugin = useContextSelector(ChatItemContext, (v) => v.isPlugin);
  const chatBoxData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const quoteData = useContextSelector(ChatItemContext, (v) => v.quoteData);
  const setQuoteData = useContextSelector(ChatItemContext, (v) => v.setQuoteData);

  // 添加appForm共享状态
  const [appForm, setAppForm] = useState<AppSimpleEditFormType>(getDefaultAppForm());
  const [renderEdit, setRenderEdit] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  // 为ChatTest准备正确的appDetail
  const [localAppDetail, setLocalAppDetail] = useState<AppSchema>({
    _id: '',
    userId: '',
    teamId: '',
    name: '',
    type: AppTypeEnum.gate,
    avatar: '',
    modules: [],
    edges: []
  });

  // Load chat init data
  const { loading } = useRequest2(
    async () => {
      if (!appId || forbidLoadChat.current) return;

      const res = await getInitChatInfo({ appId, chatId });
      res.userAvatar = userInfo?.avatar;

      // Wait for state update to complete
      setChatBoxData(res);

      // reset chat variables
      resetVariables({
        variables: res.variables,
        variableList: res.app?.chatConfig?.variables
      });

      // 添加AppForm初始化
      if (appDetail?.modules) {
        const form = appWorkflow2Form({
          nodes: appDetail.modules,
          chatConfig: appDetail.chatConfig || {}
        });
        setAppForm(form);

        // 更新本地appDetail，用于ChatTest
        setLocalAppDetail({
          ...appDetail,
          _id: appId,
          name: res.app.name,
          avatar: res.app.avatar
        });
      }
    },
    {
      manual: false,
      refreshDeps: [appId, chatId],
      onError(e: any) {
        // reset all chat tore
        if (e?.code === 501) {
          setLastChatAppId('');
          router.replace('/dashboard/apps');
        } else {
          router.replace({
            query: {
              ...router.query,
              appId: myApps[0]?._id
            }
          });
        }
      },
      onFinally() {
        forbidLoadChat.current = false;
      }
    }
  );

  const onStartChat = useCallback(
    async ({
      gateModel,
      messages,
      responseChatItemId,
      controller,
      generatingMessage,
      variables,
      selectedTool
    }: StartChatFnProps) => {
      // Just send a user prompt
      const histories = messages.slice(-1);
      const { responseText } = await streamFetch({
        data: {
          gateModel,
          messages: histories,
          variables,
          responseChatItemId,
          appId,
          chatId,
          selectedTool
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      const newTitle = getChatTitleFromChatMessage(GPTMessages2Chats(histories)[0]);

      // new chat
      onUpdateHistoryTitle({ chatId, newTitle });
      // update chat window
      setChatBoxData((state) => ({
        ...state,
        title: newTitle
      }));

      return { responseText, isNewChat: forbidLoadChat.current };
    },
    [appId, chatId, onUpdateHistoryTitle, setChatBoxData, forbidLoadChat]
  );

  const RenderHistorySlider = useMemo(() => {
    const Children = (
      <ChatHistorySlider confirmClearText={t('common:core.chat.Confirm to clear history')} />
    );

    return isPc || !appId ? (
      <SideBar externalTrigger={!!quoteData}>{Children}</SideBar>
    ) : (
      <Drawer
        isOpen={isOpenSlider}
        placement="left"
        autoFocus={false}
        size={'xs'}
        onClose={onCloseSlider}
      >
        <DrawerOverlay backgroundColor={'rgba(255,255,255,0.5)'} />
        <DrawerContent maxWidth={'75vw'}>{Children}</DrawerContent>
      </Drawer>
    );
  }, [t, isPc, appId, isOpenSlider, onCloseSlider, quoteData]);

  return (
    <AppFormContext.Provider value={{ appForm, setAppForm }}>
      <Flex h={'100%'}>
        <NextHead
          title={userInfo?.team.teamName + t('account_gate:Gate')}
          icon={chatBoxData.app.avatar}
        ></NextHead>
        {isPc && <GateSideBar apps={myApps} activeAppId={appId} />}

        {(!quoteData || isPc) && (
          <PageContainer flex={'1 0 0'} w={0} p={[0, '16px']} position={'relative'}>
            <Flex h={'100%'} flexDirection={['column', 'row']}>
              {/* pc always show history. */}
              {RenderHistorySlider}
              {/* chat container */}
              <Flex
                position={'relative'}
                h={[0, '100%']}
                w={['100%', 0]}
                flex={'1 0 0'}
                flexDirection={'column'}
              >
                {/* 添加调试模式切换按钮 */}
                {isPc && (
                  <Flex justifyContent="flex-end" p={2}>
                    <Button
                      leftIcon={<MyIcon name="text" w="16px" />}
                      size="sm"
                      onClick={() => setShowDebug(!showDebug)}
                      colorScheme="blue"
                      variant={showDebug ? 'solid' : 'outline'}
                    >
                      {showDebug ? t('app:chat_debug') : t('app:chat_debug')}
                    </Button>
                  </Flex>
                )}

                {/* chat box or test box */}
                <Box flex={'1 0 0'} bg={'white'}>
                  {showDebug ? (
                    <AppContext.Provider value={{ appDetail: localAppDetail }}>
                      <ChatTest appForm={appForm} setRenderEdit={setRenderEdit} />
                    </AppContext.Provider>
                  ) : isPlugin ? (
                    <CustomPluginRunBox
                      appId={appId}
                      chatId={chatId}
                      outLinkAuthData={outLinkAuthData}
                      onNewChat={() => onChangeChatId(getNanoid())}
                      onStartChat={onStartChat}
                    />
                  ) : (
                    <ChatBox
                      appId={appId}
                      chatId={chatId}
                      outLinkAuthData={outLinkAuthData}
                      showEmptyIntro
                      feedbackType={'user'}
                      onStartChat={onStartChat}
                      chatType={'chat'}
                      isReady={!loading}
                    />
                  )}
                </Box>
              </Flex>
            </Flex>
          </PageContainer>
        )}

        {quoteData && (
          <PageContainer flex={'1 0 0'} w={0} maxW={'560px'}>
            <ChatQuoteList
              rawSearch={quoteData.rawSearch}
              metadata={quoteData.metadata}
              onClose={() => setQuoteData(undefined)}
            />
          </PageContainer>
        )}
      </Flex>
    </AppFormContext.Provider>
  );
};

const Render = (props: { appId: string; isStandalone?: string }) => {
  const { appId, isStandalone } = props;
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { source, chatId, lastChatAppId, setSource, setAppId } = useChatStore();
  const { gateConfig, initGateConfig, loadGateApps } = useGateStore();

  const { data: myApps = [], runAsync: loadMyApps } = useRequest2(
    () => getMyApps({ getRecentlyChat: true }),
    {
      manual: false,
      refreshDeps: [appId]
    }
  );

  // 初始化聊天框
  useMount(async () => {
    // 初始化获取gate配置
    await initGateConfig();

    // 检查gate status，如果为false则重定向到应用列表页面
    if (gateConfig && !gateConfig.status) {
      toast({
        status: 'warning',
        title: t('common:Gate.service.is.unavailable')
      });
      router.replace('/dashboard/apps');
      return;
    }

    // pc: redirect to latest model chat
    if (!appId) {
      // 获取Gate应用
      const gateApps = await getMyAppsGate();
      const gateApp = gateApps[0]; // 获取第一个Gate应用

      // 如果找不到Gate应用，则加载普通应用
      if (!gateApp) {
        const apps = await loadMyApps();
        if (apps.length === 0) {
          toast({
            status: 'error',
            title: t('common:core.chat.You need to a chat app')
          });
          router.replace('/dashboard/apps');
        } else {
          router.replace({
            query: {
              ...router.query,
              appId: lastChatAppId || apps[0]._id
            }
          });
        }
      } else {
        // 使用Gate应用
        router.replace({
          query: {
            ...router.query,
            appId: gateApp._id
          }
        });
      }
    }
    setSource('online');
  });

  // 监听gateConfig变化，如果status变为false则重定向
  useEffect(() => {
    if (gateConfig && !gateConfig.status) {
      toast({
        status: 'warning',
        title: t('common:Gate.service.is.unavailable')
      });
      router.replace('/dashboard/apps');
    }
  }, [gateConfig, router, toast, t]);

  // Watch appId
  useEffect(() => {
    setAppId(appId);
  }, [appId, setAppId]);

  // 如果状态检查失败，不渲染任何内容
  if (gateConfig && !gateConfig.status) {
    return null;
  }

  const chatHistoryProviderParams = useMemo(
    () => ({ appId, source: ChatSourceEnum.online }),
    [appId]
  );
  const chatRecordProviderParams = useMemo(() => {
    return {
      appId,
      type: GetChatTypeEnum.normal,
      chatId: chatId
    };
  }, [appId, chatId]);

  return source === ChatSourceEnum.online ? (
    <ChatContextProvider params={chatHistoryProviderParams}>
      <ChatItemContextProvider
        isResponseDetail={false}
        showRouteToAppDetail={isStandalone !== '1'}
        showRouteToDatasetDetail={isStandalone !== '1'}
        isShowReadRawSource={true}
        // isShowFullText={true}
        showNodeStatus
      >
        <ChatRecordContextProvider params={chatRecordProviderParams}>
          <Chat myApps={myApps} />
        </ChatRecordContextProvider>
      </ChatItemContextProvider>
    </ChatContextProvider>
  ) : null;
};

export async function getServerSideProps(context: any) {
  return {
    props: {
      appId: context?.query?.appId || '',
      isStandalone: context?.query?.isStandalone || '',
      ...(await serviceSideProps(context, [
        'file',
        'app',
        'chat',
        'workflow',
        'account_gate',
        'common'
      ]))
    }
  };
}

export default Render;
