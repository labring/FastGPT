import React, { useEffect, useMemo, useState, useCallback } from 'react';
import NextHead from '@/components/common/NextHead';
import { useRouter } from 'next/router';
import { getInitChatInfo } from '@/web/core/chat/api';
import { Box, Flex, Drawer, DrawerOverlay, DrawerContent } from '@chakra-ui/react';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';

import PageContainer from '@/components/PageContainer';
import SideBar from '@/components/SideBar';
import { useUserStore } from '@/web/support/user/useUserStore';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { getAppDetailById, getMyApps, getMyAppsGate } from '@/web/core/app/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

import { useMount } from 'ahooks';

import { GetChatTypeEnum } from '@/global/core/chat/constants';
import ChatContextProvider, { ChatContext } from '@/web/core/chat/context/chatContext';
import type {
  AppDetailType,
  AppListItemType,
  AppSimpleEditFormType
} from '@fastgpt/global/core/app/type';
import { useContextSelector } from 'use-context-selector';
import dynamic from 'next/dynamic';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import GateNavBar from '../../../pageComponents/chat/gatechat/GateNavBar';
import { useGateStore } from '@/web/support/user/team/gate/useGateStore';
import { getDefaultAppForm, appWorkflow2Form } from '@fastgpt/global/core/app/utils';
import GateChatHistorySlider from '@/pageComponents/chat/gatechat/GateChatHistorySlider';
import GatePageContainer from '@/components/GatePageContainer';
import GateSideBar from '@/pageComponents/chat/gatechat/GateSideBar';
import FoldButton from '@/pageComponents/chat/gatechat/FoldButton';

const ChatGate = dynamic(() => import('@/pageComponents/app/detail/Gate/ChatGate'));

// AppForm共享上下文
export const AppFormContext = React.createContext<{
  appForm: AppSimpleEditFormType;
  setAppForm: React.Dispatch<React.SetStateAction<AppSimpleEditFormType>>;
}>({
  appForm: getDefaultAppForm(),
  setAppForm: () => {}
});

const Chat = ({
  myApps,
  initialAppDetail
}: {
  myApps: AppListItemType[];
  initialAppDetail?: AppDetailType;
}) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const refresh = router.query.refresh;

  const { userInfo } = useUserStore();
  const { setLastChatAppId, chatId, appId } = useChatStore();

  const isOpenSlider = useContextSelector(ChatContext, (v) => v.isOpenSlider);
  const onCloseSlider = useContextSelector(ChatContext, (v) => v.onCloseSlider);
  const forbidLoadChat = useContextSelector(ChatContext, (v) => v.forbidLoadChat);

  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  // 添加appForm共享状态，使用初始化的appDetail
  const [appForm, setAppForm] = useState<AppSimpleEditFormType>(() => {
    if (initialAppDetail?.modules) {
      return appWorkflow2Form({
        nodes: initialAppDetail.modules,
        chatConfig: initialAppDetail.chatConfig || {}
      });
    }
    return getDefaultAppForm();
  });
  const [appDetail, setAppDetail] = useState<AppDetailType | undefined>(
    () => initialAppDetail || undefined
  );
  const [renderEdit, setRenderEdit] = useState(false);
  // 添加侧边栏折叠状态
  const [sidebarFolded, setSidebarFolded] = useState(false);

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

      // 如果还没有 AppDetail，则重新获取
      if (!appDetail && appId) {
        try {
          const detail = await getAppDetailById(appId);
          if (detail?.modules) {
            setAppDetail(detail);
            const form = appWorkflow2Form({
              nodes: detail.modules,
              chatConfig: detail.chatConfig || {}
            });
            setAppForm(form);
          }
        } catch (error) {
          console.error('Failed to fetch app detail:', error);
        }
      }
    },
    {
      manual: false,
      refreshDeps: [appId, chatId, refresh], // 添加refresh作为依赖
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

  const handleFoldChange = useCallback((isFolded: boolean) => {
    setSidebarFolded(isFolded);
  }, []);

  const RenderHistorySlider = useMemo(() => {
    const Children = (
      <GateChatHistorySlider confirmClearText={t('common:core.chat.Confirm to clear history')} />
    );

    return isPc || !appId ? (
      <GateSideBar
        externalTrigger={!!datasetCiteData}
        onFoldChange={handleFoldChange}
        defaultFolded={sidebarFolded}
      >
        {Children}
      </GateSideBar>
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
  }, [
    t,
    isPc,
    appId,
    isOpenSlider,
    onCloseSlider,
    datasetCiteData,
    sidebarFolded,
    handleFoldChange
  ]);

  return (
    <AppFormContext.Provider value={{ appForm, setAppForm }}>
      <Flex h={'100%'}>
        <NextHead
          title={userInfo?.team.teamName + t('account_gate:Gate')}
          icon={userInfo?.team.teamAvatar}
        ></NextHead>
        {isPc && (
          <Flex alignItems="center">
            <GateNavBar apps={myApps} activeAppId={appId} />
          </Flex>
        )}

        {(!datasetCiteData || isPc) && (
          <GatePageContainer flex={'1 0 0'} w={0} position={'relative'}>
            {/* 将折叠按钮放在PageContainer内部，贴近左侧 */}
            {sidebarFolded && isPc && appId && (
              <Box
                position="absolute"
                left="-8px"
                top="50%"
                transform="translateY(-50%)"
                zIndex={10}
              >
                <FoldButton
                  isFolded={true}
                  onClick={() => setSidebarFolded(false)}
                  position="navbar"
                />
              </Box>
            )}
            <Flex
              h={'100%'}
              flexDirection={['column', 'row']}
              position="relative"
              overflow="visible"
            >
              {RenderHistorySlider}
              {/* chat container */}
              <Flex
                position={'relative'}
                h={[0, '100%']}
                w={['100%', 0]}
                flex={'1 0 0'}
                flexDirection={'column'}
              >
                {/* 聊天界面 */}
                {appDetail && (
                  <ChatGate appForm={appForm} setRenderEdit={setRenderEdit} appDetail={appDetail} />
                )}
              </Flex>
            </Flex>
          </GatePageContainer>
        )}

        {datasetCiteData && (
          <PageContainer flex={'1 0 0'} w={0} maxW={'560px'}>
            <ChatQuoteList
              rawSearch={datasetCiteData.rawSearch}
              metadata={datasetCiteData.metadata}
              onClose={() => setCiteModalData(undefined)}
            />
          </PageContainer>
        )}
      </Flex>
    </AppFormContext.Provider>
  );
};

const Render = (props: { appId: string; appDetail?: AppDetailType; isStandalone?: string }) => {
  const { appId, appDetail: initialAppDetail, isStandalone } = props;
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { source, chatId, lastChatAppId, setSource, setAppId } = useChatStore();
  const { gateConfig, initGateConfig } = useGateStore();

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
          <Chat myApps={myApps} initialAppDetail={initialAppDetail} />
        </ChatRecordContextProvider>
      </ChatItemContextProvider>
    </ChatContextProvider>
  ) : null;
};

export async function getServerSideProps(context: any) {
  const appId = context?.query?.appId || '';
  let appDetail;

  if (appId) {
    try {
      appDetail = await getAppDetailById(appId);
    } catch (error) {
      console.error('Failed to fetch app detail:', error);
    }
  }

  return {
    props: {
      appId,
      appDetail: appDetail || null,
      isStandalone: context?.query?.isStandalone || '',
      ...(await serviceSideProps(context, [
        'file',
        'app',
        'chat',
        'workflow',
        'account',
        'account_gate',
        'common'
      ]))
    }
  };
}

export default Render;
