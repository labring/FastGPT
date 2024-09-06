import { useUserStore } from '@/web/support/user/useUserStore';
import React, { useMemo } from 'react';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import { streamFetch } from '@/web/common/api/fetch';
import { getMaxHistoryLimitFromNodes } from '@fastgpt/global/core/workflow/runtime/utils';
import { useMemoizedFn } from 'ahooks';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from './context';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import dynamic from 'next/dynamic';
import { useChat } from '@/components/core/chat/ChatContainer/useChat';
import { Box } from '@chakra-ui/react';
import { AppChatConfigType } from '@fastgpt/global/core/app/type';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';

const PluginRunBox = dynamic(() => import('@/components/core/chat/ChatContainer/PluginRunBox'));

export const useChatTest = ({
  nodes,
  edges,
  chatConfig
}: {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  chatConfig: AppChatConfigType;
}) => {
  const { userInfo } = useUserStore();
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const startChat = useMemoizedFn(
    async ({ messages, controller, generatingMessage, variables }: StartChatFnProps) => {
      /* get histories */
      const historyMaxLen = getMaxHistoryLimitFromNodes(nodes);

      // 流请求，获取数据
      const { responseText, responseData } = await streamFetch({
        url: '/api/core/chat/chatTest',
        data: {
          // Send histories and user messages
          messages: messages.slice(-historyMaxLen - 2),
          nodes,
          edges,
          variables,
          appId: appDetail._id,
          appName: `调试-${appDetail.name}`,
          chatConfig
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      return { responseText, responseData };
    }
  );

  const pluginInputs = useMemo(() => {
    return nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput)?.inputs || [];
  }, [nodes]);

  const {
    ChatBoxRef,
    chatRecords,
    setChatRecords,
    variablesForm,
    pluginRunTab,
    setPluginRunTab,
    clearChatRecords
  } = useChat();

  const CustomChatContainer = useMemoizedFn(() =>
    appDetail.type === AppTypeEnum.plugin ? (
      <Box h={'100%'} p={3}>
        <PluginRunBox
          pluginInputs={pluginInputs}
          variablesForm={variablesForm}
          histories={chatRecords}
          setHistories={setChatRecords}
          appId={appDetail._id}
          chatConfig={appDetail.chatConfig}
          tab={pluginRunTab}
          setTab={setPluginRunTab}
          onNewChat={clearChatRecords}
          onStartChat={startChat}
        />
      </Box>
    ) : (
      <ChatBox
        ref={ChatBoxRef}
        chatHistories={chatRecords}
        setChatHistories={setChatRecords}
        variablesForm={variablesForm}
        appId={appDetail._id}
        appAvatar={appDetail.avatar}
        userAvatar={userInfo?.avatar}
        showMarkIcon
        chatConfig={chatConfig}
        onStartChat={startChat}
        onDelMessage={() => {}}
      />
    )
  );

  return {
    restartChat: clearChatRecords,
    ChatContainer: CustomChatContainer,
    chatRecords,
    pluginRunTab,
    setPluginRunTab
  };
};

export default function Dom() {
  return <></>;
}
