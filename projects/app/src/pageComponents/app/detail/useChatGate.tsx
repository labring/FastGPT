import { useUserStore } from '@/web/support/user/useUserStore';
import React, { useCallback, useEffect, useMemo } from 'react';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import { streamFetch } from '@/web/common/api/fetch';
import { useMemoizedFn } from 'ahooks';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from './context';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import dynamic from 'next/dynamic';
import { Box } from '@chakra-ui/react';
import type { AppChatConfigType, AppDetailType } from '@fastgpt/global/core/app/type';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getInitChatInfo } from '@/web/core/chat/api';
import { useTranslation } from 'next-i18next';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';

const PluginRunBox = dynamic(() => import('@/components/core/chat/ChatContainer/PluginRunBox'));

export const useChatGate = ({
  selectedToolIds,
  onSelectedToolIdsChange,
  nodes,
  edges,
  chatConfig,
  isReady,
  appDetail
}: {
  selectedToolIds?: string[];
  onSelectedToolIdsChange?: (toolIds: string[]) => void;
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  chatConfig: AppChatConfigType;
  isReady: boolean;
  appDetail: AppDetailType;
}) => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { setChatId, chatId, appId } = useChatStore();
  const onUpdateHistoryTitle = useContextSelector(ChatContext, (v) => v.onUpdateHistoryTitle);

  const startChat = useMemoizedFn(
    async ({
      messages,
      responseChatItemId,
      controller,
      generatingMessage,
      variables
    }: StartChatFnProps) => {
      const histories = messages.slice(-1);

      // 流请求，获取数据
      const { responseText } = await streamFetch({
        url: '/api/core/chat/chatGate',
        data: {
          // Send histories and user messages
          messages: histories,
          nodes,
          edges,
          variables,
          responseChatItemId,
          appId,
          appName: t('chat:chat_gate_app', { name: appDetail.name }),
          chatId,
          chatConfig,
          metadata: {
            source: 'web',
            userAgent: navigator.userAgent
          },
          selectedToolIds: selectedToolIds || []
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      // 更新聊天标题
      const newTitle = getChatTitleFromChatMessage(GPTMessages2Chats(histories)[0]);

      // 更新历史标题
      onUpdateHistoryTitle?.({ chatId, newTitle });

      // 更新聊天窗口标题
      setChatBoxData((state) => ({
        ...state,
        title: newTitle
      }));

      return { responseText };
    }
  );

  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);
  const clearChatRecords = useContextSelector(ChatItemContext, (v) => v.clearChatRecords);

  const pluginInputs = useMemo(() => {
    return nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput)?.inputs || [];
  }, [nodes]);

  // Set chat box data
  useEffect(() => {
    setChatBoxData({
      userAvatar: userInfo?.avatar,
      appId: appId,
      app: {
        chatConfig,
        name: appDetail.name,
        avatar: appDetail.avatar,
        intro: appDetail.intro,
        type: appDetail.type,
        pluginInputs
      }
    });
  }, [
    appDetail.avatar,
    appDetail.intro,
    appDetail.name,
    appDetail.type,
    appId,
    chatConfig,
    pluginInputs,
    setChatBoxData,
    userInfo?.avatar
  ]);

  // init chat data
  const { loading } = useRequest2(
    async () => {
      if (!appId || !chatId) return;
      const res = await getInitChatInfo({ appId, chatId });

      resetVariables({
        variables: res.variables,
        variableList: res.app?.chatConfig?.variables
      });
    },
    {
      manual: false,
      refreshDeps: [appId, chatId]
    }
  );

  const restartChat = useCallback(() => {
    clearChatRecords();
    setChatId();
  }, [clearChatRecords, setChatId]);

  const CustomChatContainer = useMemoizedFn(() =>
    appDetail.type === AppTypeEnum.plugin ? (
      <Box p={5} pb={16}>
        <PluginRunBox
          appId={appId}
          chatId={chatId}
          onNewChat={restartChat}
          onStartChat={startChat}
        />
      </Box>
    ) : (
      <ChatBox
        isReady={isReady}
        appId={appId}
        chatId={chatId}
        showMarkIcon
        chatType={'chat'}
        onStartChat={startChat}
        selectedToolIds={selectedToolIds}
        onSelectedToolIdsChange={onSelectedToolIdsChange}
      />
    )
  );

  return {
    ChatContainer: CustomChatContainer,
    restartChat,
    loading
  };
};

export default function Dom() {
  return <></>;
}
