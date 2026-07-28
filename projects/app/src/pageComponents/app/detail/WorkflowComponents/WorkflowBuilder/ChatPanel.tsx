import React, { useEffect, useImperativeHandle, useMemo } from 'react';
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
import {
  WorkflowBuilderAppliedSchema,
  type WorkflowBuilderApplied
} from '@fastgpt/global/openapi/core/workflow/builder/api';
import { getWorkflowChecksum } from '@fastgpt/workflow-core';
import { clearWorkflowBuilderChatHistory, streamWorkflowBuilderChat } from './api';

export type WorkflowBuilderChatPanelRef = {
  clearHistory: () => Promise<void>;
};

const WorkflowBuilderChatContent = ({
  appId,
  appDetail,
  chatId,
  sourceTarget,
  onWorkflowApplied,
  onRestart,
  chatPanelRef
}: {
  appId: string;
  appDetail: AppDetailType;
  chatId: string;
  sourceTarget: ChatSourceTarget;
  onWorkflowApplied: (result: WorkflowBuilderApplied) => Promise<void>;
  onRestart: () => void;
  chatPanelRef: React.ForwardedRef<WorkflowBuilderChatPanelRef>;
}) => {
  const { llmModelList, defaultModels } = useSystemStore();
  const sourceKey = useMemo(() => getChatSourceKey(sourceTarget), [sourceTarget]);
  const setChatBoxData = useContextSelector(ChatItemContext, (value) => value.setChatBoxData);
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
          chatConfig: WORKFLOW_BUILDER_CHAT_CONFIG
        }
      };
    });
  }, [appDetail, appId, chatId, setChatBoxData, sourceKey]);

  useRequest(
    async () => {
      const result = await getInitChatInfo({
        appId,
        chatId,
        sourceType: ChatSourceTypeEnum.app
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
    },
    {
      manual: false,
      refreshDeps: [appId, chatId, sourceKey],
      errorToast: ''
    }
  );

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
          model: selectedModel || undefined,
          workflowContext: { document, checksum }
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });
      return { responseText };
    }
  );

  const onStreamMessage = useMemoizedFn((event: generatingMessageProps) => {
    if (!event.workflowBuilderApplied) return;
    void onWorkflowApplied(WorkflowBuilderAppliedSchema.parse(event.workflowBuilderApplied));
  });

  const ModelSelector = useMemo(
    () => (
      <ChatAIModelSelector
        h={'34px'}
        minW={'112px'}
        maxW={'176px'}
        boxShadow={'none'}
        size={'sm'}
        bg={'myGray.50'}
        borderRadius={'6px'}
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
            voice: false,
            tts: false,
            inputGuide: false,
            sandbox: true,
            autoResume: true,
            quickReplies: false,
            disableFooterHoverTranslate: true
          }}
          InputLeftComponent={ModelSelector}
          onStartChat={onStartChat}
          onStreamMessage={onStreamMessage}
          pl={'12px'}
          pr={0}
          maxW={'100%'}
          boxBodyProps={{ px: 0, pt: 4, pr: '8px', maxW: '100%', mx: 0 }}
          inputBodyProps={{ maxW: '100%', mx: 0, px: 0, pl: 0, pr: '8px' }}
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
    onWorkflowApplied: (result: WorkflowBuilderApplied) => Promise<void>;
  }
>(({ appId, appDetail, onWorkflowApplied }, ref) => {
  const tmbId = useUserStore((state) => state.userInfo?.team?.tmbId ?? '');
  const sourceTarget = useMemo<ChatSourceTarget>(
    () => ({ sourceType: ChatSourceTypeEnum.app, sourceId: appId }),
    [appId]
  );
  const chatIdCacheKey = useMemo(
    () => (tmbId ? `workflow-builder:${getChatSourceKey(sourceTarget)}:${tmbId}` : ''),
    [sourceTarget, tmbId]
  );
  const chatId = useChatStore((state) => state.sourceChatIdMap[chatIdCacheKey] || '');
  const ensureSourceChatId = useChatStore((state) => state.ensureSourceChatId);
  const setSourceChatId = useChatStore((state) => state.setSourceChatId);

  useEffect(() => {
    if (chatIdCacheKey && !chatId) ensureSourceChatId(chatIdCacheKey);
  }, [chatId, chatIdCacheKey, ensureSourceChatId]);

  const chatRecordProviderParams = useMemo(
    () => ({
      chatId,
      appId,
      sourceType: ChatSourceTypeEnum.app as const
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
      showSandboxAction={false}
    >
      {chatId && (
        <ChatRecordContextProvider params={chatRecordProviderParams}>
          <WorkflowBuilderChatContent
            appId={appId}
            appDetail={appDetail}
            chatId={chatId}
            sourceTarget={sourceTarget}
            onWorkflowApplied={onWorkflowApplied}
            onRestart={onRestart}
            chatPanelRef={ref}
          />
        </ChatRecordContextProvider>
      )}
    </ChatItemContextProvider>
  );
});

ChatPanel.displayName = 'WorkflowBuilderChatPanel';

export default React.memo(ChatPanel);
