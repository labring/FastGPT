import ChatHeader from '@/pageComponents/chat/ChatHeader';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import { Flex, Box } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import SideBar from '@/components/SideBar';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { useContextSelector } from 'use-context-selector';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import { useCallback } from 'react';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import { streamFetch } from '@/web/common/api/fetch';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getInitChatInfo } from '@/web/core/chat/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import NextHead from '@/components/common/NextHead';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import { ChatSidebarPaneEnum } from '../constants';
import ChatHistorySidebar from '@/pageComponents/chat/slider/ChatSliderSidebar';
import ChatSliderMobileDrawer from '@/pageComponents/chat/slider/ChatSliderMobileDrawer';
import dynamic from 'next/dynamic';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';

const CustomPluginRunBox = dynamic(() => import('@/pageComponents/chat/CustomPluginRunBox'));

const AppChatWindow = () => {
  const { userInfo } = useUserStore();
  const { chatId, appId, outLinkAuthData } = useChatStore();

  const { t } = useTranslation();
  const { isPc } = useSystem();

  const forbidLoadChat = useContextSelector(ChatContext, (v) => v.forbidLoadChat);
  const forbidLoadChatMap = useContextSelector(ChatContext, (v) => v.forbidLoadChatMap);
  const onUpdateHistoryTitle = useContextSelector(ChatContext, (v) => v.onUpdateHistoryTitle);
  const histories = useContextSelector(ChatContext, (v) => v.histories);
  const setHistories = useContextSelector(ChatContext, (v) => v.setHistories);

  const isPlugin = useContextSelector(ChatItemContext, (v) => v.isPlugin);
  const isShowCite = useContextSelector(ChatItemContext, (v) => v.isShowCite);
  const onChangeChatId = useContextSelector(ChatContext, (v) => v.onChangeChatId);
  const chatBoxData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const totalRecordsCount = useContextSelector(ChatRecordContext, (v) => v.totalRecordsCount);

  const pane = useContextSelector(ChatPageContext, (v) => v.pane);
  const chatSettings = useContextSelector(ChatPageContext, (v) => v.chatSettings);
  const handlePaneChange = useContextSelector(ChatPageContext, (v) => v.handlePaneChange);
  const refreshRecentlyUsed = useContextSelector(ChatPageContext, (v) => v.refreshRecentlyUsed);

  const { loading } = useRequest(
    async () => {
      // 使用 chatId 级别的禁止加载标记
      if (!appId || forbidLoadChatMap.current.get(chatId)) return;

      const res = await getInitChatInfo({ appId, chatId });
      res.userAvatar = userInfo?.avatar;

      setChatBoxData(res);

      resetVariables({
        variables: res.variables,
        variableList: res.app?.chatConfig?.variables
      });
    },
    {
      manual: false,
      refreshDeps: [appId, chatId],
      errorToast: '',
      onError(e: any) {
        if (e?.code && e.code >= 502000) {
          if (e?.statusText === ChatErrEnum.unAuthChat) {
            onChangeChatId();
            return;
          }
          if (e?.statusText === AppErrEnum.unAuthApp) {
            refreshRecentlyUsed();
          }
          handlePaneChange(ChatSidebarPaneEnum.TEAM_APPS);
        }
      },
      onFinally() {
        // 清除当前 chatId 的禁止加载标记
        forbidLoadChatMap.current.delete(chatId);
        forbidLoadChat.current = false;
      }
    }
  );

  const onStartChat = useCallback(
    async ({
      messages,
      variables,
      controller,
      responseChatItemId,
      generatingMessage
    }: StartChatFnProps) => {
      const histories_messages = messages.slice(-1);

      // 立即生成标题并添加新会话到列表
      const newTitle = getChatTitleFromChatMessage(
        GPTMessages2Chats({ messages: histories_messages })[0]
      );
      const isNewChat = !histories.find((h) => h.chatId === chatId);

      if (isNewChat && chatId) {
        // 标记禁止加载，防止切换回来时重新加载空数据
        forbidLoadChatMap.current.set(chatId, true);
        forbidLoadChat.current = true;

        // 立即添加到历史列表，使用用户输入前20字作为标题
        // customTitle 设置为 newTitle，确保刷新页面后也使用固定标题
        setHistories((state) => [
          {
            chatId,
            appId,
            title: newTitle,
            updateTime: new Date(),
            customTitle: newTitle,
            top: false
          },
          ...state
        ]);
      }

      const { responseText } = await streamFetch({
        data: {
          messages: histories_messages,
          variables,
          responseChatItemId,
          appId,
          chatId,
          retainDatasetCite: isShowCite
        },
        abortCtrl: controller,
        onMessage: generatingMessage
      });

      // 只更新 chatBoxData 的标题，不再更新 histories（避免抖动）
      setChatBoxData((state) => ({
        ...state,
        title: newTitle
      }));

      refreshRecentlyUsed();

      return { responseText, isNewChat: forbidLoadChat.current };
    },
    [
      appId,
      chatId,
      setChatBoxData,
      forbidLoadChat,
      isShowCite,
      refreshRecentlyUsed,
      forbidLoadChatMap,
      histories,
      setHistories
    ]
  );

  return (
    <Flex h={'100%'} flexDirection={['column', 'row']}>
      {/* set window title and icon */}
      <NextHead title={chatBoxData.app.name} icon={chatBoxData.app.avatar} />

      {/* show history slider */}
      {isPc ? (
        <SideBar externalTrigger={Boolean(datasetCiteData)}>
          <ChatHistorySidebar
            menuConfirmButtonText={t('common:core.chat.Confirm to clear history')}
          />
        </SideBar>
      ) : (
        <ChatSliderMobileDrawer
          banner={chatSettings?.wideLogoUrl}
          menuConfirmButtonText={t('common:core.chat.Confirm to clear history')}
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
        <ChatHeader
          pane={pane}
          chatSettings={chatSettings}
          showHistory
          history={chatRecords}
          totalRecordsCount={totalRecordsCount}
        />

        <Box flex={'1 0 0'} bg={'white'}>
          {isPlugin ? (
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
              isReady={!loading}
              feedbackType={'user'}
              chatType={ChatTypeEnum.chat}
              outLinkAuthData={outLinkAuthData}
              onStartChat={onStartChat}
            />
          )}
        </Box>
      </Flex>
    </Flex>
  );
};

export default AppChatWindow;
