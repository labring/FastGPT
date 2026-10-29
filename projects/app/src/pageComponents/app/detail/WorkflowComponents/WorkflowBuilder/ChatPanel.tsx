import React, { useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { Box, Button, Flex, Spinner, Text } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useContextSelector } from 'use-context-selector';
import { useLocalStorageState, useMemoizedFn } from 'ahooks';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import ChatAIModelSelector from '@/pageComponents/chat/ChatWindow/ChatAIModelSelector';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useAppBuilderChat } from '@/web/core/chat/useAppBuilderChat';
import { getChatSourceKey, type ChatSourceTarget } from '@/web/core/chat/utils';
import { getInitChatInfo } from '@/web/core/chat/api';
import { useModelDefault } from '@/web/core/ai/model/useModelDefault';
import { useModelDetail } from '@/web/core/ai/model/useModelDetail';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { AppDetailType } from '@fastgpt/global/core/app/type';
import { WORKFLOW_BUILDER_CHAT_CONFIG } from '@fastgpt/global/core/workflow/builder/constants';
import { WorkflowBufferDataContext } from '../context/workflowInitContext';
import {
  appDetailToWorkflowDocumentApp,
  reactFlowStateToWorkflowDocument
} from '../adapters/document';
import { getWorkflowChecksum } from '@fastgpt/workflow-core/domain/checksum';
import { streamWorkflowBuilderChat } from './api';
import type { WorkflowBuilderVersionActions } from '@/web/core/chat/context/chatItemContext';
import type { WorkflowBuilderVersion } from '@fastgpt/global/core/workflow/builder/type';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { ChatGenerateStatusEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { WorkflowBuilderActivity } from './context';
import { useTranslation } from 'next-i18next';
import {
  getWorkflowBuilderErrorAttentionKey,
  getWorkflowBuilderPendingInteractiveKey,
  getWorkflowBuilderWatchChatId,
  isWorkflowBuilderVersionGenerating
} from './uiState';
import { WORKFLOW_BUILDER_CHAT_ID_QUERY_KEY } from '@/web/core/app/utils';

export type WorkflowBuilderChatPanelRef = {
  restartChat: () => void;
  /** 将已提交版本写回当前会话记录；忽略切换会话后迟到的应用结果。 */
  updateAppliedVersion: (data: {
    appId: string;
    chatId: string;
    responseChatItemId: string;
    version: WorkflowBuilderVersion;
  }) => void;
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
  onActivityChange,
  watchExternalChat
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
  watchExternalChat: boolean;
}) => {
  const { t } = useTranslation('workflow');
  const sourceKey = useMemo(() => getChatSourceKey(sourceTarget), [sourceTarget]);
  const setChatBoxData = useContextSelector(ChatItemContext, (value) => value.setChatBoxData);
  const chatBoxData = useContextSelector(ChatItemContext, (value) => value.chatBoxData);
  const ChatBoxRef = useContextSelector(ChatItemContext, (value) => value.ChatBoxRef);
  const chatRecords = useContextSelector(ChatRecordContext, (value) => value.chatRecords);
  const setChatRecords = useContextSelector(ChatRecordContext, (value) => value.setChatRecords);
  const isChatRecordsLoaded = useContextSelector(
    ChatRecordContext,
    (value) => value.isChatRecordsLoaded
  );
  const clearChatRecords = useContextSelector(ChatItemContext, (value) => value.clearChatRecords);
  const getNodes = useContextSelector(WorkflowBufferDataContext, (value) => value.getNodes);
  const edges = useContextSelector(WorkflowBufferDataContext, (value) => value.edges);
  const modelStorageKey = `fastgpt:workflow-builder:model:${appId}`;
  const [selectedModelId, setSelectedModelId] = useLocalStorageState<string>(modelStorageKey, {
    defaultValue: ''
  });
  const { model: defaultModel } = useModelDefault({
    modelType: ModelTypeEnum.llm,
    enabled: !selectedModelId
  });
  const { model: selectedModel } = useModelDetail({
    modelType: ModelTypeEnum.llm,
    modelId: selectedModelId
  });

  useEffect(() => {
    if (!selectedModelId && defaultModel) setSelectedModelId(defaultModel.modelId);
  }, [defaultModel, selectedModelId, setSelectedModelId]);

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
    restartChat: () => {
      // 新对话只重置当前展示和会话 ID，保留服务端历史及其版本归档。
      clearChatRecords();
      onRestart();
    },
    updateAppliedVersion: (data) => {
      if (data.appId !== appId || data.chatId !== chatId) return;
      // 以消息和版本共同定位，避免同一配置重复生成时误标其他版本。
      setChatRecords((records) =>
        records.map((record) => {
          if (record.obj !== ChatRoleEnum.AI || record.dataId !== data.responseChatItemId) {
            return record;
          }
          return {
            ...record,
            value: record.value.map((item) =>
              item.workflowBuilderVersion?.checksum === data.version.checksum
                ? { ...item, workflowBuilderVersion: data.version }
                : item
            )
          };
        })
      );
    }
  }));

  useEffect(() => {
    onChatIdChange(chatId);
  }, [chatId, onChatIdChange]);

  useEffect(() => {
    if (focusRequestId === 0) return;
    const frame = window.requestAnimationFrame(() => ChatBoxRef?.current?.focusInput?.());
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
    () =>
      getInitChatInfo({
        appId,
        chatId,
        sourceType: ChatSourceTypeEnum.workflowBuilder
      }),
    {
      manual: false,
      pollingInterval: watchExternalChat ? 1500 : undefined,
      refreshDeps: [appId, chatId, sourceKey],
      errorToast: '',
      // 只由仍有效的请求水合详情，避免旧会话覆盖新对话及其生成状态。
      onSuccess: (result) => {
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
      }
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
    async ({ messages, responseChatItemId, controller, generatingMessage }: StartChatFnProps) => {
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
          model: selectedModelId || undefined,
          workflowContext: { document, checksum }
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });
      return { responseText };
    }
  );

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
        modelType={ModelTypeEnum.llm}
        value={selectedModelId}
        onChange={(modelId) => {
          setSelectedModelId(modelId);
        }}
      />
    ),
    [selectedModelId, setSelectedModelId]
  );

  return (
    <Box display={'flex'} flexDirection={'column'} h={'100%'} minH={0}>
      <Box flex={1} minH={0} overflow={'hidden'}>
        <ChatBox
          dialogTips={t('builder_input_placeholder')}
          isReady={!!selectedModel}
          active={!watchExternalChat}
          sourceTarget={sourceTarget}
          chatId={chatId}
          chatType={ChatTypeEnum.test}
          features={{
            markRead: false,
            voice: true,
            tts: false,
            inputGuide: false,
            sandbox: false,
            autoResume: true,
            quickReplies: true,
            disableFooterHoverTranslate: true,
            workflowBuilderInput: true,
            hideAgentAskOptionDescription: true
          }}
          InputLeftComponent={ModelSelector}
          onStartChat={onStartChat}
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
      workflowBuilderVersionActions,
      onChatIdChange,
      focusRequestId,
      onActivityChange
    },
    ref
  ) => {
    const { t } = useTranslation('common');
    const router = useRouter();
    const showRunDetail = useSystemStore(
      (state) => state.feConfigs.showAuxiliaryGenerationRunDetail ?? false
    );
    const sourceTarget = useMemo<ChatSourceTarget>(
      () => ({ sourceType: ChatSourceTypeEnum.workflowBuilder, sourceId: appId }),
      [appId]
    );
    const watchChatId = getWorkflowBuilderWatchChatId(
      router.query[WORKFLOW_BUILDER_CHAT_ID_QUERY_KEY]
    );
    const { chatId, restartChat, restoreChat, isRestoringChat, restoreChatError } =
      useAppBuilderChat({
        appId,
        sourceType: ChatSourceTypeEnum.workflowBuilder,
        watchChatId,
        ready: router.isReady
      });

    const chatRecordProviderParams = useMemo(
      () => ({
        chatId,
        appId,
        sourceType: ChatSourceTypeEnum.workflowBuilder as const
      }),
      [appId, chatId]
    );
    const onRestart = useMemoizedFn(() => {
      restartChat();
      if (watchChatId) {
        // 新对话属于当前成员，退出旁观链接后才能采用刚缓存的会话 ID。
        const query = { ...router.query };
        delete query[WORKFLOW_BUILDER_CHAT_ID_QUERY_KEY];
        void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
      }
    });

    return (
      <ChatItemContextProvider
        showRouteToDatasetDetail={false}
        canDownloadSource={false}
        isShowCite={false}
        isShowFullText={false}
        showRunningStatus={true}
        showSkillReferences={true}
        showWholeResponse={showRunDetail}
        showPoints={false}
        showAvatar={true}
        showSandboxAction={false}
        workflowBuilderVersionActions={workflowBuilderVersionActions}
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
              watchExternalChat={Boolean(watchChatId)}
            />
          </ChatRecordContextProvider>
        )}
      </ChatItemContextProvider>
    );
  }
);

ChatPanel.displayName = 'WorkflowBuilderChatPanel';

export default React.memo(ChatPanel);
