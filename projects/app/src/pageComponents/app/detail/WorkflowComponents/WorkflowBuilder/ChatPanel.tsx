import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Box } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { useLocalStorageState, useMemoizedFn } from 'ahooks';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import type {
  StartChatFnProps,
  generatingMessageProps
} from '@/components/core/chat/ChatContainer/type';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import ChatAIModelSelector from '@/pageComponents/chat/ChatWindow/ChatAIModelSelector';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { getChatSourceKey, type ChatSourceTarget } from '@/web/core/chat/utils';
import { getInitChatInfo } from '@/web/core/chat/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { AppDetailType } from '@fastgpt/global/core/app/type';
import { WORKFLOW_BUILDER_CHAT_CONFIG } from '@fastgpt/global/core/workflow/builder/constants';
import { WorkflowBufferDataContext } from '../context/workflowInitContext';
import {
  appDetailToWorkflowDocumentApp,
  reactFlowStateToWorkflowDocument
} from '../adapters/document';
import { getWorkflowChecksum } from '@fastgpt/workflow-core';
import {
  clearWorkflowBuilderChatHistory,
  prewarmWorkflowBuilderRuntime,
  streamWorkflowBuilderChat
} from './api';
import type { WorkflowBuilderVersionActions } from '@/web/core/chat/context/chatItemContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { ChatGenerateStatusEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { WorkflowBuilderActivity } from './context';
import { useTranslation } from 'next-i18next';
import {
  getWorkflowBuilderErrorAttentionKey,
  getWorkflowBuilderPendingInteractiveKey,
  isWorkflowBuilderVersionGenerating,
  shouldPrewarmWorkflowBuilderRuntime
} from './uiState';

export type WorkflowBuilderChatPanelRef = {
  clearHistory: () => Promise<void>;
};

const WorkflowBuilderChatContent = ({
  appId,
  appDetail,
  chatId,
  sourceTarget,
  onChatIdChange,
  onRestart,
  chatPanelRef,
  focusRequestId,
  onActivityChange
}: {
  appId: string;
  appDetail: AppDetailType;
  chatId: string;
  sourceTarget: ChatSourceTarget;
  onChatIdChange: (chatId: string) => void;
  onRestart: () => void;
  chatPanelRef: React.ForwardedRef<WorkflowBuilderChatPanelRef>;
  focusRequestId: number;
  onActivityChange: (activity: WorkflowBuilderActivity) => void;
}) => {
  const { t } = useTranslation('workflow');
  const { llmModelList, defaultModels } = useSystemStore();
  const sourceKey = useMemo(() => getChatSourceKey(sourceTarget), [sourceTarget]);
  const setChatBoxData = useContextSelector(ChatItemContext, (value) => value.setChatBoxData);
  const chatBoxData = useContextSelector(ChatItemContext, (value) => value.chatBoxData);
  const ChatBoxRef = useContextSelector(ChatItemContext, (value) => value.ChatBoxRef);
  const chatRecords = useContextSelector(ChatRecordContext, (value) => value.chatRecords);
  const isChatRecordsLoaded = useContextSelector(
    ChatRecordContext,
    (value) => value.isChatRecordsLoaded
  );
  const clearChatRecords = useContextSelector(ChatItemContext, (value) => value.clearChatRecords);
  const getNodes = useContextSelector(WorkflowBufferDataContext, (value) => value.getNodes);
  const edges = useContextSelector(WorkflowBufferDataContext, (value) => value.edges);
  const modelList = useMemo(
    () => llmModelList.map((model) => ({ label: model.name, value: model.model })),
    [llmModelList]
  );
  const defaultModel = defaultModels.llm?.model || llmModelList[0]?.model || '';
  const modelStorageKey = `fastgpt:workflow-builder:model:${appId}`;
  const [storedModel, setStoredModel] = useLocalStorageState<string>(modelStorageKey, {
    defaultValue: defaultModel
  });
  const availableModels = useMemo(
    () => new Set(llmModelList.map((model) => model.model)),
    [llmModelList]
  );
  const selectedModel =
    storedModel && availableModels.has(storedModel) ? storedModel : defaultModel;
  const chatInfoRequestKey = `${sourceKey}:${chatId}`;
  const generationStorageKey = `fastgpt:workflow-builder:generating:${appId}:${chatId}`;
  const chatGeneratingStorageKey = `fastgpt:workflow-builder:chat-generating:${appId}:${chatId}`;
  const [hydratedChatInfoKey, setHydratedChatInfoKey] = useState('');
  const builderChatConfig = useMemo(
    () => ({
      ...WORKFLOW_BUILDER_CHAT_CONFIG,
      welcomeConfig: {
        welcomeText: t('workflow_builder_welcome', { appName: appDetail.name }),
        welcomeQuestions: [
          t('workflow_builder_example_daily_report'),
          t('workflow_builder_example_review_assistant'),
          t('workflow_builder_example_resume_screening')
        ]
      }
    }),
    [appDetail.name, t]
  );
  useImperativeHandle(chatPanelRef, () => ({
    clearHistory: () =>
      clearWorkflowBuilderChatHistory({
        appId,
        chatId,
        clearChatRecords,
        restartChat: onRestart
      })
  }));

  useEffect(() => {
    onChatIdChange(chatId);
  }, [chatId, onChatIdChange]);

  useEffect(() => {
    if (focusRequestId === 0) return;
    const frame = window.requestAnimationFrame(() => ChatBoxRef?.current?.focusInput());
    return () => window.cancelAnimationFrame(frame);
  }, [ChatBoxRef, focusRequestId]);

  useEffect(() => {
    setChatBoxData((previous) => {
      const isSameChat = previous.sourceKey === sourceKey && previous.chatId === chatId;
      return {
        ...previous,
        sourceKey,
        appId,
        chatId,
        title: isSameChat ? previous.title : undefined,
        chatGenerateStatus: isSameChat ? previous.chatGenerateStatus : undefined,
        hasBeenRead: isSameChat ? previous.hasBeenRead : undefined,
        app: {
          name: appDetail.name,
          avatar: appDetail.avatar,
          intro: appDetail.intro,
          type: appDetail.type,
          pluginInputs: [],
          chatConfig: builderChatConfig
        }
      };
    });
  }, [appDetail, appId, builderChatConfig, chatId, setChatBoxData, sourceKey]);

  useRequest(
    async () => {
      const result = await getInitChatInfo({
        appId,
        chatId,
        sourceType: ChatSourceTypeEnum.workflowBuilder
      });
      setChatBoxData((previous) => ({
        ...previous,
        sourceKey,
        appId,
        chatId: result.chatId || chatId,
        title: result.title,
        chatGenerateStatus: result.chatGenerateStatus,
        hasBeenRead: result.hasBeenRead
      }));
      setHydratedChatInfoKey(chatInfoRequestKey);
    },
    {
      manual: false,
      refreshDeps: [appId, chatId, sourceKey],
      errorToast: ''
    }
  );

  useEffect(() => {
    const isChatGenerating = chatBoxData.chatGenerateStatus === ChatGenerateStatusEnum.generating;
    const isActivityHydrated = isChatRecordsLoaded && hydratedChatInfoKey === chatInfoRequestKey;
    // 整段对话运行态独立于 Mermaid 确认阶段；水合完成前沿用本标签页缓存，避免刷新时光环闪断。
    const wasChatGenerating = window.sessionStorage.getItem(chatGeneratingStorageKey) === 'true';
    const isWorkflowBuilderChatGenerating = isActivityHydrated
      ? isChatGenerating
      : wasChatGenerating;
    // 历史记录和聊天状态分别异步加载，二者就绪前沿用确认阶段，避免已确认预览被误判为待交互。
    const wasBuildingWorkflow = window.sessionStorage.getItem(generationStorageKey) === 'true';
    const isBuildingWorkflow = isActivityHydrated
      ? isWorkflowBuilderVersionGenerating({
          chatRecords,
          isChatGenerating,
          wasBuildingWorkflow
        })
      : wasBuildingWorkflow;

    if (isActivityHydrated) {
      if (isChatGenerating) {
        window.sessionStorage.setItem(chatGeneratingStorageKey, 'true');
      } else {
        window.sessionStorage.removeItem(chatGeneratingStorageKey);
      }

      if (isBuildingWorkflow) {
        window.sessionStorage.setItem(generationStorageKey, 'true');
      } else {
        window.sessionStorage.removeItem(generationStorageKey);
      }
    }

    const latestVersion = (() => {
      for (let recordIndex = chatRecords.length - 1; recordIndex >= 0; recordIndex -= 1) {
        const record = chatRecords[recordIndex];
        if (record?.obj !== ChatRoleEnum.AI) continue;
        for (let valueIndex = record.value.length - 1; valueIndex >= 0; valueIndex -= 1) {
          const version = record.value[valueIndex]?.workflowBuilderVersion;
          if (version) return { version, responseChatItemId: record.dataId };
        }
      }
    })();
    onActivityChange({
      isChatGenerating: isWorkflowBuilderChatGenerating,
      isBuildingWorkflow,
      pendingInteractiveKey: getWorkflowBuilderPendingInteractiveKey(chatRecords, {
        isBuildingWorkflow
      }),
      errorAttentionKey: getWorkflowBuilderErrorAttentionKey({
        chatRecords,
        chatGenerateStatus: chatBoxData.chatGenerateStatus
      }),
      latestVersion
    });
  }, [
    chatBoxData.chatGenerateStatus,
    chatGeneratingStorageKey,
    chatInfoRequestKey,
    chatRecords,
    generationStorageKey,
    hydratedChatInfoKey,
    isChatRecordsLoaded,
    onActivityChange
  ]);

  const onStartChat = useMemoizedFn(
    async ({
      messages,
      responseChatItemId,
      agentPlanAskResponse,
      controller,
      generatingMessage
    }: StartChatFnProps) => {
      const document = reactFlowStateToWorkflowDocument({
        nodes: getNodes(),
        edges,
        chatConfig: appDetail.chatConfig,
        app: appDetailToWorkflowDocumentApp(appDetail)
      });
      const checksum = await getWorkflowChecksum(document);
      const { responseText } = await streamWorkflowBuilderChat({
        data: {
          appId,
          chatId,
          responseChatItemId,
          messages: messages.slice(-1),
          model: selectedModel || undefined,
          agentPlanAskResponse,
          workflowContext: { document, checksum }
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });
      return { responseText };
    }
  );

  const onStreamMessage = useMemoizedFn((_event: generatingMessageProps) => undefined);

  const ModelSelector = useMemo(
    () => (
      <ChatAIModelSelector
        h={'36px'}
        minW={'112px'}
        maxW={'176px'}
        boxShadow={'none'}
        size={'sm'}
        bg={'myGray.50'}
        border={'0.5px solid #DFE2EA'}
        borderRadius={'10px'}
        value={selectedModel}
        list={modelList}
        onChange={(model) => {
          setStoredModel(model);
        }}
      />
    ),
    [modelList, selectedModel, setStoredModel]
  );

  return (
    <Box display={'flex'} flexDirection={'column'} h={'100%'} minH={0}>
      <Box flex={1} minH={0} overflow={'hidden'}>
        <ChatBox
          isReady={!!selectedModel}
          sourceTarget={sourceTarget}
          chatId={chatId}
          chatType={ChatTypeEnum.test}
          features={{
            markRead: false,
            mark: false,
            voice: true,
            tts: false,
            inputGuide: false,
            sandbox: true,
            autoResume: true,
            quickReplies: true,
            disableFooterHoverTranslate: true,
            workflowBuilderInput: true,
            workflowBuilderResponseCollapse: true,
            hideAgentAskOptionDescription: true
          }}
          InputLeftComponent={ModelSelector}
          onStartChat={onStartChat}
          onStreamMessage={onStreamMessage}
          px={0}
          maxW={'100%'}
          boxBodyProps={{ px: '16px', pt: 0, maxW: '100%', mx: 0 }}
          inputBodyProps={{ maxW: '100%', mx: 0, px: '16px' }}
        />
      </Box>
    </Box>
  );
};

const ChatPanel = React.forwardRef<
  WorkflowBuilderChatPanelRef,
  {
    appId: string;
    appDetail: AppDetailType;
    isOpen: boolean;
    workflowBuilderEnabled: boolean;
    workflowBuilderVersionActions: WorkflowBuilderVersionActions;
    onChatIdChange: (chatId: string) => void;
    focusRequestId: number;
    onActivityChange: (activity: WorkflowBuilderActivity) => void;
  }
>(
  (
    {
      appId,
      appDetail,
      isOpen,
      workflowBuilderEnabled,
      workflowBuilderVersionActions,
      onChatIdChange,
      focusRequestId,
      onActivityChange
    },
    ref
  ) => {
    const tmbId = useUserStore((state) => state.userInfo?.team?.tmbId ?? '');
    const sourceTarget = useMemo<ChatSourceTarget>(
      () => ({ sourceType: ChatSourceTypeEnum.workflowBuilder, sourceId: appId }),
      [appId]
    );
    const chatIdCacheKey = useMemo(
      () => (tmbId ? `workflow-builder:${getChatSourceKey(sourceTarget)}:${tmbId}` : ''),
      [sourceTarget, tmbId]
    );
    const chatId = useChatStore((state) => state.sourceChatIdMap[chatIdCacheKey] || '');
    const ensureSourceChatId = useChatStore((state) => state.ensureSourceChatId);
    const setSourceChatId = useChatStore((state) => state.setSourceChatId);
    const prewarmStartedRuntimeKeyRef = useRef('');

    useEffect(() => {
      if (chatIdCacheKey && !chatId) ensureSourceChatId(chatIdCacheKey);
    }, [chatId, chatIdCacheKey, ensureSourceChatId]);

    useRequest(
      async () => {
        if (
          !shouldPrewarmWorkflowBuilderRuntime({
            workflowBuilderEnabled,
            isOpen,
            chatId,
            runtimeKey: chatIdCacheKey,
            prewarmStartedRuntimeKey: prewarmStartedRuntimeKeyRef.current
          })
        ) {
          return;
        }

        prewarmStartedRuntimeKeyRef.current = chatIdCacheKey;
        await prewarmWorkflowBuilderRuntime({ appId, chatId }).catch((error) => {
          if (prewarmStartedRuntimeKeyRef.current === chatIdCacheKey) {
            prewarmStartedRuntimeKeyRef.current = '';
          }
          throw error;
        });
      },
      {
        manual: false,
        ready: workflowBuilderEnabled && isOpen && Boolean(chatId),
        // Sandbox 按应用和成员隔离：首次打开时预热，关闭重开或 chatId 变化不重复请求。
        refreshDeps: [appId, tmbId, isOpen, workflowBuilderEnabled],
        errorToast: ''
      }
    );

    const chatRecordProviderParams = useMemo(
      () => ({
        chatId,
        appId,
        sourceType: ChatSourceTypeEnum.workflowBuilder as const
      }),
      [appId, chatId]
    );
    const onRestart = useMemoizedFn(() => {
      setSourceChatId(chatIdCacheKey);
    });

    return (
      <ChatItemContextProvider
        showRouteToDatasetDetail={false}
        canDownloadSource={false}
        isShowCite={false}
        isShowFullText={false}
        showRunningStatus={true}
        showSkillReferences={true}
        showWholeResponse={true}
        showPoints={true}
        showAvatar={true}
        showSandboxAction={true}
        workflowBuilderVersionActions={workflowBuilderVersionActions}
      >
        {chatId && (
          <ChatRecordContextProvider params={chatRecordProviderParams} showInitialLoading={false}>
            <WorkflowBuilderChatContent
              appId={appId}
              appDetail={appDetail}
              chatId={chatId}
              sourceTarget={sourceTarget}
              onChatIdChange={onChatIdChange}
              onRestart={onRestart}
              chatPanelRef={ref}
              focusRequestId={focusRequestId}
              onActivityChange={onActivityChange}
            />
          </ChatRecordContextProvider>
        )}
      </ChatItemContextProvider>
    );
  }
);

ChatPanel.displayName = 'WorkflowBuilderChatPanel';

export default React.memo(ChatPanel);
