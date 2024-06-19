import { useUserStore } from '@/web/support/user/useUserStore';
import React, { useCallback, useRef } from 'react';
import ChatBox from '@/components/ChatBox';
import type { ComponentRef, StartChatFnProps } from '@/components/ChatBox/type.d';
import { streamFetch } from '@/web/common/api/fetch';
import { checkChatSupportSelectFileByModules } from '@/web/core/chat/utils';
import {
  getDefaultEntryNodeIds,
  getMaxHistoryLimitFromNodes,
  initWorkflowEdgeStatus,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { useMemoizedFn } from 'ahooks';
import { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from './context';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';

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
  const ChatBoxRef = useRef<ComponentRef>(null);
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const startChat = useMemoizedFn(
    async ({ chatList, controller, generatingMessage, variables }: StartChatFnProps) => {
      /* get histories */
      let historyMaxLen = getMaxHistoryLimitFromNodes(nodes);

      const history = chatList.slice(-historyMaxLen - 2, -2);

      // 流请求，获取数据
      const { responseText, responseData } = await streamFetch({
        url: '/api/core/chat/chatTest',
        data: {
          history,
          prompt: chatList[chatList.length - 2].value,
          nodes: storeNodes2RuntimeNodes(nodes, getDefaultEntryNodeIds(nodes)),
          edges: initWorkflowEdgeStatus(edges),
          variables,
          appId: appDetail._id,
          appName: `调试-${appDetail.name}`
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      return { responseText, responseData };
    }
  );

  const resetChatBox = useCallback(() => {
    ChatBoxRef.current?.resetHistory([]);
    ChatBoxRef.current?.resetVariables();
  }, []);

  const CustomChatBox = useMemoizedFn(() => (
    <ChatBox
      ref={ChatBoxRef}
      appId={appDetail._id}
      appAvatar={appDetail.avatar}
      userAvatar={userInfo?.avatar}
      showMarkIcon
      chatConfig={chatConfig}
      showFileSelector={checkChatSupportSelectFileByModules(nodes)}
      onStartChat={startChat}
      onDelMessage={() => {}}
    />
  ));

  return {
    resetChatBox,
    ChatBox: CustomChatBox
  };
};

export default function Dom() {
  return <></>;
}
