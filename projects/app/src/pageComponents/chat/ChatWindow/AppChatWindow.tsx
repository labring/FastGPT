import ChatHeader from '@/pageComponents/chat/ChatHeader';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import { Flex, Box } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import SideBar from '@/components/SideBar';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { useContextSelector } from 'use-context-selector';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { type AppListItemType } from '@fastgpt/global/core/app/type';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import { useCallback } from 'react';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import { streamFetch } from '@/web/common/api/fetch';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getInitChatInfo } from '@/web/core/chat/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import NextHead from '@/components/common/NextHead';
import { ChatSettingContext } from '@/web/core/chat/context/chatSettingContext';
import { ChatSidebarPaneEnum } from '../constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ChatHistorySidebar from '@/pageComponents/chat/slider/ChatSliderSidebar';
import ChatSliderMobileDrawer from '@/pageComponents/chat/slider/ChatSliderMobileDrawer';

type Props = {
  myApps: AppListItemType[];
};

const AppChatWindow = ({ myApps }: Props) => {
  const { userInfo } = useUserStore();
  const { chatId, appId, outLinkAuthData } = useChatStore();
  const { feConfigs } = useSystemStore();

  const { t } = useTranslation();
  const { isPc } = useSystem();

  const forbidLoadChat = useContextSelector(ChatContext, (v) => v.forbidLoadChat);
  const onUpdateHistoryTitle = useContextSelector(ChatContext, (v) => v.onUpdateHistoryTitle);

  const chatBoxData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const totalRecordsCount = useContextSelector(ChatRecordContext, (v) => v.totalRecordsCount);

  const pane = useContextSelector(ChatSettingContext, (v) => v.pane);
  const chatSettings = useContextSelector(ChatSettingContext, (v) => v.chatSettings);
  const handlePaneChange = useContextSelector(ChatSettingContext, (v) => v.handlePaneChange);

  const { loading } = useRequest2(
    async () => {
      if (!appId || forbidLoadChat.current) return;

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
          handlePaneChange(ChatSidebarPaneEnum.TEAM_APPS);
        }
      },
      onFinally() {
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
      const histories = messages.slice(-1);
      const { responseText } = await streamFetch({
        data: {
          messages: histories,
          variables,
          responseChatItemId,
          appId,
          chatId
        },
        abortCtrl: controller,
        onMessage: generatingMessage
      });

      const newTitle = getChatTitleFromChatMessage(GPTMessages2Chats(histories)[0]);

      onUpdateHistoryTitle({ chatId, newTitle });
      setChatBoxData((state) => ({
        ...state,
        title: newTitle
      }));

      return { responseText, isNewChat: forbidLoadChat.current };
    },
    [appId, chatId, onUpdateHistoryTitle, setChatBoxData, forbidLoadChat]
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
          showHeader
          showFooter
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
          apps={myApps}
          history={chatRecords}
          totalRecordsCount={totalRecordsCount}
        />

        <Box flex={'1 0 0'} bg={'white'}>
          <ChatBox
            showEmptyIntro
            appId={appId}
            chatId={chatId}
            isReady={!loading}
            feedbackType={'user'}
            chatType={ChatTypeEnum.chat}
            outLinkAuthData={outLinkAuthData}
            onStartChat={onStartChat}
          />
        </Box>
      </Flex>
    </Flex>
  );
};

export default AppChatWindow;
