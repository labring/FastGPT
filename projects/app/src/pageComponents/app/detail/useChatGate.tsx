import { useUserStore } from '@/web/support/user/useUserStore';
import React, { useCallback, useEffect, useState } from 'react';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import { streamFetch } from '@/web/common/api/fetch';
import { useMemoizedFn, useSafeState } from 'ahooks';
import { useContextSelector } from 'use-context-selector';
import type { AppDetailType, AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getInitChatInfo } from '@/web/core/chat/api';
import { useTranslation } from 'next-i18next';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { form2AppWorkflow } from '@/web/core/app/utils';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import { listQuickApps } from '@/web/support/user/team/gate/quickApp';

export const useChatGate = ({
  appForm,
  isReady,
  appDetail
}: {
  appForm: AppSimpleEditFormType;
  isReady: boolean;
  appDetail: AppDetailType;
}) => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { setChatId, chatId, appId } = useChatStore();
  const [selectedTools, setSelectedTools] = useState<FlowNodeTemplateType[]>([]);

  const [workflowData, setWorkflowData] = useSafeState({
    nodes: appDetail.modules || [],
    edges: appDetail.edges || []
  });
  useEffect(() => {
    const { nodes, edges } = form2AppWorkflow(
      {
        ...appForm,
        selectedTools
      },
      t
    );
    setWorkflowData({ nodes, edges });
  }, [appForm, selectedTools, setWorkflowData, t]);

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
          nodes: workflowData.nodes,
          edges: workflowData.edges,
          variables,
          responseChatItemId,
          appId,
          appName: t('chat:chat_gate_app', { name: appDetail.name }),
          chatId,
          chatConfig: appForm.chatConfig,
          metadata: {
            source: 'web',
            userAgent: navigator.userAgent
          }
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

  // Set chat box data
  useEffect(() => {
    setChatBoxData({
      userAvatar: userInfo?.avatar,
      appId: appId,
      app: {
        chatConfig: appForm.chatConfig,
        name: appDetail.name,
        avatar: appDetail.avatar,
        intro: appDetail.intro,
        type: appDetail.type,
        pluginInputs: []
      }
    });
  }, [
    appDetail.avatar,
    appDetail.intro,
    appDetail.name,
    appDetail.type,
    appForm.chatConfig,
    appId,
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

  // 精选应用
  const { data: recommendApps = [] } = useRequest2(listQuickApps, {
    manual: false
  });
  console.log(appForm, 111);
  const CustomChatContainer = useMemoizedFn(() => (
    <ChatBox
      isReady={isReady}
      appId={appId}
      chatId={chatId}
      showMarkIcon
      chatType={'chat'}
      onStartChat={startChat}
      selectedTools={selectedTools}
      onSelectTools={setSelectedTools}
      recommendApps={recommendApps}
    />
  ));

  return {
    ChatContainer: CustomChatContainer,
    restartChat,
    loading
  };
};

export default function Dom() {
  return <></>;
}
