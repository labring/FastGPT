import React, { useCallback, useEffect, useState } from 'react';
import NextHead from '@/components/common/NextHead';
import { delChatRecordById, getChatHistories, getTeamChatInfo } from '@/web/core/chat/api';
import { useRouter } from 'next/router';
import { Box, Flex, Drawer, DrawerOverlay, DrawerContent, useTheme } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import SideBar from '@/components/SideBar';
import PageContainer from '@/components/PageContainer';
import { getMyTokensApps } from '@/web/core/chat/api';
import ChatHistorySlider from './components/ChatHistorySlider';
import ChatHeader from './components/ChatHeader';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useTranslation } from 'next-i18next';
import { checkChatSupportSelectFileByChatModels } from '@/web/core/chat/utils';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import { streamFetch } from '@/web/common/api/fetch';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import SliderApps from './components/SliderApps';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import ChatContextProvider, { ChatContext } from '@/web/core/chat/context/chatContext';
import { AppListItemType } from '@fastgpt/global/core/app/type';
import { useContextSelector } from 'use-context-selector';
import { InitChatResponse } from '@/global/core/chat/api';
import { defaultChatData } from '@/global/core/chat/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useChat } from '@/components/core/chat/ChatContainer/useChat';

import dynamic from 'next/dynamic';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
const CustomPluginRunBox = dynamic(() => import('./components/CustomPluginRunBox'));

type Props = { appId: string; chatId: string; teamId: string; teamToken: string };

const Chat = ({ myApps }: { myApps: AppListItemType[] }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    teamId = '',
    appId = '',
    chatId = '',
    teamToken,
    ...customVariables
  } = router.query as Props & {
    [key: string]: string;
  };

  const { toast } = useToast();
  const theme = useTheme();
  const { isPc } = useSystem();

  const [chatData, setChatData] = useState<InitChatResponse>(defaultChatData);

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

  const {
    ChatBoxRef,
    chatRecords,
    setChatRecords,
    variablesForm,
    pluginRunTab,
    setPluginRunTab,
    resetChatRecords
  } = useChat();

  const startChat = useCallback(
    async ({ messages, controller, generatingMessage, variables }: StartChatFnProps) => {
      const completionChatId = chatId || getNanoid();
      // Just send a user prompt
      const histories = messages.slice(-1);

      const { responseText, responseData } = await streamFetch({
        data: {
          messages: histories,
          variables: {
            ...variables,
            ...customVariables
          },
          appId,
          teamId,
          teamToken,
          chatId: completionChatId,
          appType: chatData.app.type
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      const newTitle = getChatTitleFromChatMessage(GPTMessages2Chats(histories)[0]);

      // new chat
      if (completionChatId !== chatId) {
        onChangeChatId(completionChatId, true);
      }
      loadHistories();

      // update chat window
      setChatData((state) => ({
        ...state,
        title: newTitle
      }));

      return { responseText, responseData, isNewChat: forbidLoadChat.current };
    },
    [
      chatData.app.type,
      chatId,
      customVariables,
      appId,
      teamId,
      teamToken,
      forbidLoadChat,
      onChangeChatId,
      loadHistories
    ]
  );

  // get chat app info
  const { loading } = useRequest2(
    async () => {
      if (!appId || forbidLoadChat.current) return;

      const res = await getTeamChatInfo({ teamId, appId, chatId, teamToken });
      setChatData(res);

      const history = res.history.map((item) => ({
        ...item,
        dataId: item.dataId || nanoid(),
        status: ChatStatusEnum.finish
      }));

      // reset chat records
      resetChatRecords({
        records: history,
        variables: res.variables
      });
    },
    {
      manual: false,
      refreshDeps: [teamId, teamToken, appId, chatId],
      onError(e: any) {
        toast({
          title: getErrText(e, t('common:core.chat.Failed to initialize chat')),
          status: 'error'
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

  return (
    <Flex h={'100%'}>
      <NextHead title={chatData.app.name} icon={chatData.app.avatar}></NextHead>
      {/* pc show myself apps */}
      {isPc && (
        <Box borderRight={theme.borders.base} w={'220px'} flexShrink={0}>
          <SliderApps apps={myApps} activeAppId={appId} />
        </Box>
      )}

      <PageContainer isLoading={loading} flex={'1 0 0'} w={0} p={[0, '16px']} position={'relative'}>
        <Flex h={'100%'} flexDirection={['column', 'row']} bg={'white'}>
          {((children: React.ReactNode) => {
            return isPc || !appId ? (
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
                <DrawerContent maxWidth={'75vw'}>{children}</DrawerContent>
              </Drawer>
            );
          })(
            <ChatHistorySlider
              appId={appId}
              appName={chatData.app.name}
              appAvatar={chatData.app.avatar}
              confirmClearText={t('common:core.chat.Confirm to clear history')}
              onDelHistory={(e) => onDelHistory({ ...e, appId, teamId, teamToken })}
              onClearHistory={() => {
                onClearHistories({ appId, teamId, teamToken });
              }}
              onSetHistoryTop={(e) => {
                onUpdateHistory({ ...e, teamId, teamToken, appId });
              }}
              onSetCustomTitle={async (e) => {
                onUpdateHistory({
                  appId,
                  chatId: e.chatId,
                  customTitle: e.title,
                  teamId,
                  teamToken
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
            <ChatHeader apps={myApps} chatData={chatData} history={chatRecords} showHistory />
            {/* chat box */}
            <Box flex={1}>
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
                  ref={ChatBoxRef}
                  chatHistories={chatRecords}
                  setChatHistories={setChatRecords}
                  variablesForm={variablesForm}
                  appAvatar={chatData.app.avatar}
                  userAvatar={chatData.userAvatar}
                  chatConfig={chatData.app?.chatConfig}
                  showFileSelector={checkChatSupportSelectFileByChatModels(chatData.app.chatModels)}
                  feedbackType={'user'}
                  onStartChat={startChat}
                  onDelMessage={({ contentId }) =>
                    delChatRecordById({
                      contentId,
                      appId: chatData.appId,
                      chatId,
                      teamId,
                      teamToken
                    })
                  }
                  appId={chatData.appId}
                  chatId={chatId}
                  teamId={teamId}
                  teamToken={teamToken}
                />
              )}
            </Box>
          </Flex>
        </Flex>
      </PageContainer>
    </Flex>
  );
};

const Render = (props: Props) => {
  const { teamId, appId, teamToken } = props;
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();

  const { data: myApps = [], runAsync: loadMyApps } = useRequest2(
    async () => {
      if (teamId && teamToken) {
        return getMyTokensApps({ teamId, teamToken });
      }
      return [];
    },
    {
      manual: false
    }
  );

  const { data: histories = [], runAsync: loadHistories } = useRequest2(
    async () => {
      if (teamId && appId && teamToken) {
        return getChatHistories({ teamId, appId, teamToken: teamToken });
      }
      return [];
    },
    {
      manual: false,
      refreshDeps: [appId, teamId, teamToken]
    }
  );

  // 初始化聊天框
  useEffect(() => {
    (async () => {
      if (appId || myApps.length === 0) return;

      router.replace({
        query: {
          ...router.query,
          appId: myApps[0]._id,
          chatId: ''
        }
      });
    })();
  }, [appId, loadMyApps, myApps, router, t, toast]);

  return (
    <ChatContextProvider histories={histories} loadHistories={loadHistories}>
      <Chat {...props} myApps={myApps} />
    </ChatContextProvider>
  );
};

export async function getServerSideProps(context: any) {
  return {
    props: {
      appId: context?.query?.appId || '',
      chatId: context?.query?.chatId || '',
      teamId: context?.query?.teamId || '',
      teamToken: context?.query?.teamToken || '',
      ...(await serviceSideProps(context, ['file', 'app']))
    }
  };
}

export default Render;
