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
import { useRequest } from '@fastgpt/web/hooks/useRequest';
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

  /**
   * 同步测试对话的基础上下文。
   * ChatBox 的刷新恢复依赖 chatBoxData.appId/chatId 与当前 props 完全一致，否则不会触发 enableAutoResume。
   */
  useEffect(() => {
    setChatBoxData((prev) => {
      const isSameChat = prev.appId === appId && prev.chatId === chatId;

      return {
        ...prev,
        userAvatar: userInfo?.avatar,
        appId,
        chatId,
        chatGenerateStatus: isSameChat ? prev.chatGenerateStatus : undefined,
        hasBeenRead: isSameChat ? prev.hasBeenRead : undefined,
        app: {
          chatConfig,
          name: appDetail.name,
          avatar: appDetail.avatar,
          type: appDetail.type,
          pluginInputs
        }
      };
    });
  }, [
    appDetail.avatar,
    appDetail.name,
    appDetail.type,
    appId,
    chatId,
    chatConfig,
    pluginInputs,
    setChatBoxData,
    userInfo?.avatar
  ]);

  // init chat data
  const { loading } = useRequest(
    async () => {
      if (!appId || !chatId) return;
      const res = await getInitChatInfo({ appId, chatId });
      resetVariables({
        variables: res.variables,
        variableList: variableList ?? res.app?.chatConfig?.variables
      });
      /**
       * 与线上一致：同步会话生成状态。
       * 这里也写回 appId/chatId，避免 init 返回后覆盖链路缺字段导致刷新恢复条件不成立。
       */
      setChatBoxData((prev) => ({
        ...prev,
        appId: res.appId || appId,
        chatId: res.chatId || chatId,
        title: res.title,
        chatGenerateStatus: res.chatGenerateStatus,
        hasBeenRead: res.hasBeenRead
      }));
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

  const CustomChatContainer = useMemoizedFn(() =>
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
        enableAutoResume
        onStartChat={startChat}
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
