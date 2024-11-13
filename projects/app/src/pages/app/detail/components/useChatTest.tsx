import { useUserStore } from '@/web/support/user/useUserStore';
import React, { useCallback, useMemo, useState } from 'react';
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
import { Box, BoxProps } from '@chakra-ui/react';
import { AppChatConfigType } from '@fastgpt/global/core/app/type';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import { ChatSiteItemType } from '@fastgpt/global/core/chat/type';

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
  const [chatRecords, setChatRecords] = useState<ChatSiteItemType[]>([]);

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

  const { ChatBoxRef, variablesForm, pluginRunTab, setPluginRunTab, clearChatRecords } = useChat();

  // Mock ScrollData
  const ScrollData = useCallback(
    ({
      children,
      ScrollContainerRef,
      ...props
    }: {
      ScrollContainerRef?: React.RefObject<HTMLDivElement>;
      children: React.ReactNode;
    } & BoxProps) => {
      return (
        <Box ref={ScrollContainerRef} {...props} overflow={'overlay'}>
          {children}
        </Box>
      );
    },
    []
  );

  const CustomChatContainer = useMemoizedFn(() =>
    appDetail.type === AppTypeEnum.plugin ? (
      <Box p={5}>
        <PluginRunBox
          pluginInputs={pluginInputs}
          variablesForm={variablesForm}
          histories={chatRecords}
          setHistories={setChatRecords}
          appId={appDetail._id}
          chatConfig={appDetail.chatConfig}
          tab={pluginRunTab}
          setTab={setPluginRunTab}
          onNewChat={() => {
            clearChatRecords();
            setChatRecords([]);
          }}
          onStartChat={startChat}
        />
      </Box>
    ) : (
      <ChatBox
        ref={ChatBoxRef}
        ScrollData={ScrollData}
        chatHistories={chatRecords}
        setChatHistories={setChatRecords}
        variablesForm={variablesForm}
        appId={appDetail._id}
        appAvatar={appDetail.avatar}
        userAvatar={userInfo?.avatar}
        showMarkIcon
        chatType="chat"
        showRawSource
        showNodeStatus
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
