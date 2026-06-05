import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import { Flex, Box, IconButton } from '@chakra-ui/react';
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
import ChatHistorySidebar, {
  CHAT_HISTORY_SLIDER_PC_WIDTH
} from '@/pageComponents/chat/slider/ChatSliderSidebar';
import ChatSliderMobileDrawer from '@/pageComponents/chat/slider/ChatSliderMobileDrawer';
import dynamic from 'next/dynamic';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import ChatWindowHeader from './ChatWindowHeader';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import ToolMenu from '@/pageComponents/chat/ToolMenu';
import { mobileChatHeaderIconButtonStyle } from './headerIconButtonStyle';

const CustomPluginRunBox = dynamic(() => import('@/pageComponents/chat/CustomPluginRunBox'));

const AppChatWindow = () => {
  const { userInfo } = useUserStore();
  const { chatId, appId, outLinkAuthData } = useChatStore();

  const { t } = useTranslation();
  const { isPc } = useSystem();

  const forbidLoadChatRef = useContextSelector(ChatContext, (v) => v.forbidLoadChat);
  const onUpdateHistoryTitle = useContextSelector(ChatContext, (v) => v.onUpdateHistoryTitle);
  const onOpenSlider = useContextSelector(ChatContext, (v) => v.onOpenSlider);

  const isPlugin = useContextSelector(ChatItemContext, (v) => v.isPlugin);
  const isShowCite = useContextSelector(ChatItemContext, (v) => v.isShowCite);
  const showSkillReferences = useContextSelector(ChatItemContext, (v) => v.showSkillReferences);
  const onChangeChatId = useContextSelector(ChatContext, (v) => v.onChangeChatId);
  const chatBoxData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);

  const isCurrentChatReady = chatBoxData.appId === appId && chatBoxData.chatId === chatId;

  const chatSettings = useContextSelector(ChatPageContext, (v) => v.chatSettings);
  const handlePaneChange = useContextSelector(ChatPageContext, (v) => v.handlePaneChange);
  const refreshRecentlyUsed = useContextSelector(ChatPageContext, (v) => v.refreshRecentlyUsed);
  const collapseSidebar = useContextSelector(ChatPageContext, (v) => v.collapseSidebar);

  const { loading } = useRequest(
    async () => {
      if (!appId || forbidLoadChatRef.current) return;

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
          handlePaneChange(ChatSidebarPaneEnum.ALL_APPS);
        }
      },
      onFinally() {
        forbidLoadChatRef.current = false;
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
      if (!appId) {
        return Promise.reject('appId is empty');
      }

      collapseSidebar();

      const histories = messages.slice(-1);
      const { responseText } = await streamFetch({
        data: {
          messages: histories,
          variables,
          responseChatItemId,
          appId,
          chatId,
          retainDatasetCite: isShowCite,
          showSkillReferences
        },
        abortCtrl: controller,
        onMessage: generatingMessage
      });

      const newTitle = getChatTitleFromChatMessage(GPTMessages2Chats({ messages: histories })[0]);

      onUpdateHistoryTitle({ chatId, newTitle });
      setChatBoxData((state) => ({
        ...state,
        title: newTitle
      }));

      refreshRecentlyUsed();

      return { responseText, isNewChat: forbidLoadChatRef.current };
    },
    [
      appId,
      chatId,
      onUpdateHistoryTitle,
      setChatBoxData,
      forbidLoadChatRef,
      isShowCite,
      showSkillReferences,
      refreshRecentlyUsed,
      collapseSidebar
    ]
  );

  return (
    <Flex h={'100%'} flexDirection={['column', 'row']}>
      {/* set window title and icon */}
      <NextHead title={chatBoxData.app.name} icon={chatBoxData.app.avatar} />

      {/* show history slider */}
      {isPc ? (
        <SideBar
          w={`0 0 ${CHAT_HISTORY_SLIDER_PC_WIDTH}`}
          externalTrigger={Boolean(datasetCiteData)}
        >
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
        {isPc ? (
          <ChatWindowHeader
            title={chatBoxData.title}
            history={chatRecords}
            chatType={ChatTypeEnum.chat}
          />
        ) : (
          <Flex
            h="48px"
            px={4}
            bg="white"
            alignItems="center"
            justifyContent="space-between"
            color="myGray.600"
          >
            <IconButton
              aria-label="Open history"
              icon={
                <MyIcon name="core/chat/sidebar/menu" w="20px" h="20px" color="currentColor" />
              }
              variant="unstyled"
              {...mobileChatHeaderIconButtonStyle}
              onClick={onOpenSlider}
            />

            <Flex alignItems="center" minW={0} flex="1" justifyContent="center" px={3}>
              <Avatar src={chatBoxData.app.avatar} w="20px" borderRadius="6px" />
              <Box ml={2} fontSize="16px" fontWeight={500} color="myGray.900" className="textEllipsis">
                {chatBoxData.app.name}
              </Box>
            </Flex>

            <Box minW="36px">
              <ToolMenu history={chatRecords} chatType={ChatTypeEnum.chat} />
            </Box>
          </Flex>
        )}

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
              isReady={!loading && !!appId && isCurrentChatReady}
              enableAutoResume
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
