import React, { type ReactNode, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Button, Flex, Spinner, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useMemoizedFn } from 'ahooks';
import { useContextSelector } from 'use-context-selector';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { createChatAgentHelperAppConfig } from '@fastgpt/global/core/ai/auxiliaryGeneration/chatAgentHelper';
import { ChatAgentHelperTypeEnum } from '@fastgpt/global/core/ai/auxiliaryGeneration/constants';
import { ChatTypeEnum } from '../ChatContainer/ChatBox/constants';
import ChatBox from '../ChatContainer/ChatBox';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import { streamFetch } from '@/web/common/api/fetch';
import type { generatingMessageProps, StartChatFnProps } from '../ChatContainer/type';
import { AuxiliaryGenerationEventEnum } from '@fastgpt/global/core/ai/auxiliaryGeneration/constants';
import { getChatSourceKey, type ChatSourceTarget } from '@/web/core/chat/utils';
import { useAppBuilderChat } from '@/web/core/chat/useAppBuilderChat';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { loadChatAgentConfig } from './api';
import { getInitChatInfo } from '@/web/core/chat/api';
import { useSystemStore } from '@/web/common/system/useSystemStore';
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
  onApply: (e: ChatAgentConfigFormDataType) => void | Promise<void>;
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
        title: isSameChat ? prev.title : undefined,
        chatGenerateStatus: isSameChat ? prev.chatGenerateStatus : undefined,
        hasBeenRead: isSameChat ? prev.hasBeenRead : undefined,
        app: createChatAgentHelperAppConfig()
      };
    });
  }, [appId, chatId, setChatBoxData, sourceKey]);

  useRequest(
    async () => {
      if (!appId || !chatId) return;

      return getInitChatInfo({
        appId,
        chatId,
        sourceType: ChatSourceTypeEnum.chatAgentHelper
      });
    },
    {
      manual: false,
      refreshDeps: [appId, chatId, sourceKey],
      // 回写放在 onSuccess，让请求取消和卸载保护拦截旧会话的迟到响应。
      onSuccess: (res) => {
        if (!res) return;
        setChatBoxData((prev) => ({
          ...prev,
          sourceKey,
          appId,
          chatId: res.chatId || chatId,
          title: res.title,
          chatGenerateStatus: res.chatGenerateStatus,
          hasBeenRead: res.hasBeenRead
        }));
      }
    }
  );

  // 由 ChatBox 的统一事件入口调用，让首次生成和刷新恢复都能应用生成配置。
  const onGeneratingMessage = useMemoizedFn((event: generatingMessageProps) => {
    if (
      event.event === AuxiliaryGenerationEventEnum.chatAgentConfig &&
      event.formData &&
      type === ChatAgentHelperTypeEnum.chatAgent
    ) {
      onApply(event.formData);
    }
  });

  const onStartChat = async ({
    messages,
    responseChatItemId,
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
        metadata: {
          type,
          data: metadata
        }
      },
      onMessage: generatingMessage,
      abortCtrl: controller
    });

    return { responseText };
  };

  useImperativeHandle(ChatBoxRef, () => ({
    restartChat() {
      // 保留旧会话，切换到独立的新 chatId 后再开始辅助生成。
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
      onGeneratingMessage={onGeneratingMessage}
    />
  );
};

const ChatAgentHelper = (props: ChatAgentHelperProps) => {
  const { t } = useTranslation(['common', 'app']);
  const { toast } = useToast();
  const showRunDetail = useSystemStore(
    (state) => state.feConfigs.showAuxiliaryGenerationRunDetail ?? false
  );
  const sourceTarget = useMemo<ChatSourceTarget>(
    () => ({
      sourceType: ChatSourceTypeEnum.chatAgentHelper,
      sourceId: props.appId
    }),
    [props.appId]
  );
  const { chatId, restartChat, restoreChat, isRestoringChat, restoreChatError } = useAppBuilderChat(
    {
      appId: props.appId,
      sourceType: ChatSourceTypeEnum.chatAgentHelper
    }
  );
  const chatRecordProviderParams = useMemo(
    () => ({
      chatId,
      appId: props.appId,
      sourceType: ChatSourceTypeEnum.chatAgentHelper as const
    }),
    [chatId, props.appId]
  );

  const applyingConfigRef = useRef(false);
  const { run: applyConfig, loading: isApplyingConfig } = useRequest(
    async (responseChatItemId: string) => {
      if (applyingConfigRef.current) return;
      applyingConfigRef.current = true;
      try {
        const { formData } = await loadChatAgentConfig({
          appId: props.appId,
          chatId,
          responseChatItemId
        });
        await props.onApply(formData);
        toast({ status: 'success', title: t('app:chat_agent_config_applied') });
      } finally {
        applyingConfigRef.current = false;
      }
    }
  );
  const chatAgentBuilderVersionActions = useMemo(
    () => ({ isApplying: isApplyingConfig, applyConfig }),
    [isApplyingConfig, applyConfig]
  );

  return (
    <ChatItemContextProvider
      chatAgentBuilderVersionActions={chatAgentBuilderVersionActions}
      showRouteToDatasetDetail={false}
      canDownloadSource={false}
      isShowCite={false}
      isShowFullText={false}
      showRunningStatus={true}
      showSkillReferences={false}
      showWholeResponse={showRunDetail}
      showPoints={false}
      showAvatar={true}
      showSandboxAction={false}
    >
      {!chatId && (
        <Flex flex={1} alignItems="center" justifyContent="center" flexDirection="column" gap={3}>
          {restoreChatError && !isRestoringChat ? (
            <>
              <Text color="myGray.500">{t('load_failed')}</Text>
              <Button variant="whiteBase" onClick={restoreChat}>
                {t('refresh')}
              </Button>
            </>
          ) : (
            <Spinner size="sm" />
          )}
        </Flex>
      )}
      {chatId && (
        <ChatRecordContextProvider params={chatRecordProviderParams}>
          <ChatAgentHelperChatBox
            {...props}
            chatId={chatId}
            onRestart={restartChat}
            sourceTarget={sourceTarget}
          />
        </ChatRecordContextProvider>
      )}
    </ChatItemContextProvider>
  );
};

export default React.memo(ChatAgentHelper);
