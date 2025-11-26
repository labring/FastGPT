import { useUserStore } from '@/web/support/user/useUserStore';
import React, { useCallback, useEffect, useMemo } from 'react';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import { streamFetch } from '@/web/common/api/fetch';
import { useMemoizedFn } from 'ahooks';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from './context';
import { type StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { type StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import dynamic from 'next/dynamic';
import { Box } from '@chakra-ui/react';
import { type AppChatConfigType } from '@fastgpt/global/core/app/type';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getInitChatInfo } from '@/web/core/chat/api';
import { useTranslation } from 'next-i18next';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';

const PluginRunBox = dynamic(() => import('@/components/core/chat/ChatContainer/PluginRunBox'));

export const useChatTest = ({
  nodes,
  edges,
  chatConfig = {},
  isReady
}: {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  chatConfig: AppChatConfigType;
  isReady: boolean;
}) => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { setChatId, chatId, appId } = useChatStore();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);

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
        url: '/api/core/chat/chatTest',
        data: {
          // Send histories and user messages
          messages: histories,
          nodes,
          edges,
          variables,
          responseChatItemId,
          appId,
          appName: t('chat:chat_test_app', { name: appDetail.name }),
          chatId,
          chatConfig
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      return { responseText };
    }
  );

  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const variablesForm = useContextSelector(ChatItemContext, (v) => v.variablesForm);
  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);
  const clearChatRecords = useContextSelector(ChatItemContext, (v) => v.clearChatRecords);

  const variableList = useMemo(() => chatConfig.variables, [chatConfig.variables]);

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
        type: appDetail.type,
        pluginInputs
      }
    });
  }, [
    appDetail.avatar,
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
        variableList: variableList ?? res.app?.chatConfig?.variables
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

  // 新增变量时候，自动加入默认值
  useEffect(() => {
    if (variableList) {
      variableList.forEach((item) => {
        const val = variablesForm.getValues(`variables.${item.key}`);
        if (item.defaultValue !== undefined && (val === undefined || val === null || val === '')) {
          variablesForm.setValue(`variables.${item.key}`, item.defaultValue);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variableList]);

  const CustomChatContainer = useCallback(
    () =>
      appDetail.type === AppTypeEnum.workflowTool ? (
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
          chatType={ChatTypeEnum.test}
          onStartChat={startChat}
        />
      ),
    [appDetail.type, appId, chatId, isReady, restartChat, startChat]
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
