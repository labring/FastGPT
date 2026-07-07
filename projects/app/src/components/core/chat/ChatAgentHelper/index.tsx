import React, { type ReactNode, useEffect, useImperativeHandle, useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { createChatAgentHelperAppConfig } from '@fastgpt/global/core/ai/auxiliaryGeneration/chatAgentHelper';
import { ChatAgentHelperTypeEnum } from '@fastgpt/global/core/ai/auxiliaryGeneration/constants';
import { ChatTypeEnum } from '../ChatContainer/ChatBox/constants';
import ChatBox from '../ChatContainer/ChatBox';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import { streamFetch } from '@/web/common/api/fetch';
import type { StartChatFnProps } from '../ChatContainer/type';
import { AuxiliaryGenerationEventEnum } from '@fastgpt/global/core/ai/auxiliaryGeneration/constants';
import { getChatSourceKey, type ChatSourceTarget } from '@/web/core/chat/utils';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getInitChatInfo } from '@/web/core/chat/api';
import type {
  ChatAgentConfigFormDataType,
  ChatAgentHelperMetadataType
} from '@fastgpt/global/core/ai/auxiliaryGeneration/type';

export type ChatAgentHelperRefType = {
  restartChat: () => void;
};

export type ChatAgentHelperProps = {
  InputLeftComponent?: ReactNode;
  ChatBoxRef: React.ForwardedRef<ChatAgentHelperRefType>;
  appId: string;
} & {
  type: typeof ChatAgentHelperTypeEnum.chatAgent;
  metadata: ChatAgentHelperMetadataType;
  onApply: (e: ChatAgentConfigFormDataType) => void;
};

const ChatAgentHelperChatBox = ({
  type,
  appId,
  metadata,
  onApply,
  ChatBoxRef,
  InputLeftComponent,
  chatId,
  onRestart,
  sourceTarget
}: ChatAgentHelperProps & {
  chatId: string;
  onRestart: () => void;
  sourceTarget: ChatSourceTarget;
}) => {
  const sourceKey = useMemo(() => getChatSourceKey(sourceTarget), [sourceTarget]);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const clearChatRecords = useContextSelector(ChatItemContext, (v) => v.clearChatRecords);

  useEffect(() => {
    setChatBoxData((prev) => {
      const isSameChat = prev.sourceKey === sourceKey && prev.chatId === chatId;

      return {
        ...prev,
        sourceKey,
        appId,
        chatId,
        chatGenerateStatus: isSameChat ? prev.chatGenerateStatus : undefined,
        hasBeenRead: isSameChat ? prev.hasBeenRead : undefined,
        app: createChatAgentHelperAppConfig()
      };
    });
  }, [appId, chatId, setChatBoxData, sourceKey]);

  useRequest(
    async () => {
      if (!appId || !chatId) return;

      const res = await getInitChatInfo({
        appId,
        chatId,
        sourceType: ChatSourceTypeEnum.chatAgentHelper
      });

      setChatBoxData((prev) => ({
        ...prev,
        sourceKey,
        appId,
        chatId: res.chatId || chatId,
        title: res.title,
        chatGenerateStatus: res.chatGenerateStatus,
        hasBeenRead: res.hasBeenRead
      }));
    },
    {
      manual: false,
      refreshDeps: [appId, chatId, sourceKey]
    }
  );

  const onStartChat = async ({
    messages,
    responseChatItemId,
    interactive,
    controller,
    generatingMessage
  }: StartChatFnProps) => {
    if (!responseChatItemId) {
      throw new Error('ChatAgentHelper response chat item id is empty');
    }

    const { responseText } = await streamFetch({
      url: '/api/proApi/core/chat/chatAgentHelper/completions',
      data: {
        chatId,
        responseChatItemId,
        appId,
        messages,
        interactive,
        metadata: {
          type,
          data: metadata
        }
      },
      onMessage: (event) => {
        if (
          event.event === AuxiliaryGenerationEventEnum.chatAgentConfig &&
          event.formData &&
          type === ChatAgentHelperTypeEnum.chatAgent
        ) {
          onApply(event.formData);
        }
        generatingMessage(event);
      },
      abortCtrl: controller
    });

    return { responseText };
  };

  useImperativeHandle(ChatBoxRef, () => ({
    restartChat() {
      clearChatRecords();
      onRestart();
    }
  }));

  return (
    <ChatBox
      isReady
      sourceTarget={sourceTarget}
      chatId={chatId}
      chatType={ChatTypeEnum.test}
      features={{
        markRead: false,
        mark: false,
        voice: false,
        tts: false,
        inputGuide: false,
        sandbox: false,
        autoResume: true,
        quickReplies: false,
        disableFooterHoverTranslate: true
      }}
      InputLeftComponent={InputLeftComponent}
      onStartChat={onStartChat}
    />
  );
};

const ChatAgentHelper = (props: ChatAgentHelperProps) => {
  const sourceTarget = useMemo<ChatSourceTarget>(
    () => ({
      sourceType: ChatSourceTypeEnum.chatAgentHelper,
      sourceId: props.appId
    }),
    [props.appId]
  );
  const sourceKey = useMemo(() => getChatSourceKey(sourceTarget), [sourceTarget]);
  const chatId = useChatStore((state) => state.sourceChatIdMap[sourceKey] || '');
  const ensureSourceChatId = useChatStore((state) => state.ensureSourceChatId);
  const setSourceChatId = useChatStore((state) => state.setSourceChatId);
  const chatRecordProviderParams = useMemo(
    () => ({
      chatId,
      appId: props.appId,
      sourceType: ChatSourceTypeEnum.chatAgentHelper as const
    }),
    [chatId, props.appId]
  );

  useEffect(() => {
    if (!chatId) {
      ensureSourceChatId(sourceKey);
    }
  }, [chatId, ensureSourceChatId, sourceKey]);

  const onRestart = () => {
    setSourceChatId(sourceKey);
  };

  return (
    <ChatItemContextProvider
      showRouteToDatasetDetail={false}
      canDownloadSource={false}
      isShowCite={false}
      isShowFullText={false}
      showRunningStatus={true}
      showSkillReferences={false}
      showWholeResponse={false}
      showPoints={false}
      showAvatar={true}
      showSandboxAction={false}
    >
      {chatId && (
        <ChatRecordContextProvider params={chatRecordProviderParams}>
          <ChatAgentHelperChatBox
            {...props}
            chatId={chatId}
            onRestart={onRestart}
            sourceTarget={sourceTarget}
          />
        </ChatRecordContextProvider>
      )}
    </ChatItemContextProvider>
  );
};

export default React.memo(ChatAgentHelper);
