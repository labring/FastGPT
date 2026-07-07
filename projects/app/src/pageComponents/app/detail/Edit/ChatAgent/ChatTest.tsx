import { Box, Flex, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';

import { useLocalStorageState, useSafeState } from 'ahooks';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../context';
import { useChatTest } from '../../useChatTest';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import { AgentChatTestTabEnum, useChatStore } from '@/web/core/chat/context/useChatStore';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { cardStyles } from '../../constants';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import type { Form2WorkflowFnType } from '../FormComponent/type';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import ChatAgentHelper from '@/components/core/chat/ChatAgentHelper';
import type { ChatAgentHelperRefType } from '@/components/core/chat/ChatAgentHelper';
import { ChatAgentHelperTypeEnum } from '@fastgpt/global/core/ai/auxiliaryGeneration/constants';
import { checkAgentSkillSandboxUnavailable, loadGeneratedTools } from './utils';
import { systemSubInfo } from '@fastgpt/global/core/workflow/node/agent/constants';
import { useSandboxEditor, useSandboxStatus } from '@/pageComponents/chat/SandboxEditor/hook';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import ChatVariableButton from '@/pageComponents/chat/ChatWindow/ChatVariableButton';
import ProModal from '@/components/ProTip/ProModal';
import ChatAIModelSelector from '@/pageComponents/chat/ChatWindow/ChatAIModelSelector';

type Props = {
  appForm: AppFormEditFormType;
  setAppForm: React.Dispatch<React.SetStateAction<AppFormEditFormType>>;
  setRenderEdit: React.Dispatch<React.SetStateAction<boolean>>;
  form2WorkflowFn: Form2WorkflowFnType;
};
const ChatTest = ({ appForm, setAppForm, setRenderEdit, form2WorkflowFn }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { chatId, agentChatTestTab, setAgentChatTestTab } = useChatStore();
  const { feConfigs, llmModelList, defaultModels } = useSystemStore();
  const { teamPlanStatus } = useUserStore();
  const enableSandbox = !teamPlanStatus?.standard || !!teamPlanStatus?.standard?.enableSandbox;
  const showSandbox = feConfigs.show_agent_sandbox;
  const isAgentSkillSandboxUnavailable = checkAgentSkillSandboxUnavailable({
    appForm,
    showSandbox,
    enableSandbox
  });

  const canUseHelper = !!feConfigs?.isPlus;
  const activeTab = canUseHelper ? agentChatTestTab : AgentChatTestTabEnum.chatDebug;
  const [hasRenderedHelper, setHasRenderedHelper] = useSafeState(false);
  const [proModalOpen, setProModalOpen] = useSafeState(false);
  const [helperSelectedModel, setHelperSelectedModel] = useLocalStorageState<string>(
    'chat_agent_helper_model',
    {
      defaultValue: defaultModels.llm?.model
    }
  );
  const ChatAgentHelperRef = useRef<ChatAgentHelperRefType>(null);

  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  const [workflowData, setWorkflowData] = useSafeState({
    nodes: appDetail.modules || [],
    edges: appDetail.edges || []
  });

  const modelSelectList = useMemo(
    () => llmModelList.map((item) => ({ label: item.name, value: item.model })),
    [llmModelList]
  );
  const helperModel = useMemo(() => {
    const modelSet = new Set(llmModelList.map((item) => item.model));
    const defaultModel = defaultModels.llm?.model || llmModelList[0]?.model || '';

    if (helperSelectedModel && modelSet.has(helperSelectedModel)) {
      return helperSelectedModel;
    }
    if (defaultModel && modelSet.has(defaultModel)) {
      return defaultModel;
    }
    return llmModelList[0]?.model || '';
  }, [defaultModels.llm?.model, helperSelectedModel, llmModelList]);
  const onChangeHelperModel = useCallback(
    (model: string) => {
      setHelperSelectedModel(model);
    },
    [setHelperSelectedModel]
  );
  const HelperModelSelectorInput = useMemo(
    () => (
      <Box w={'fit-content'} maxW={'300px'} flex={'0 1 auto'} minW={0}>
        <ChatAIModelSelector
          h={'36px'}
          w={'fit-content'}
          maxW={'300px'}
          boxShadow={'none'}
          size={'sm'}
          bg={'myGray.50'}
          rounded={'10px'}
          value={helperModel}
          list={modelSelectList}
          onChange={onChangeHelperModel}
        />
      </Box>
    ),
    [helperModel, modelSelectList, onChangeHelperModel]
  );

  // Sandbox: Status Hook 负责网络同步，UI Hook 负责弹窗渲染
  const { SandboxEntryIcon } = useSandboxStatus({
    appId: appDetail._id,
    chatId
  });
  const { SandboxEditorModal, onOpenSandboxModal } = useSandboxEditor({
    appId: appDetail._id,
    chatId
  });

  useEffect(() => {
    const { nodes, edges } = form2WorkflowFn(appForm, t);
    setWorkflowData({ nodes, edges });
  }, [appForm, form2WorkflowFn, setWorkflowData, t]);

  useEffect(() => {
    setRenderEdit(!datasetCiteData);
  }, [datasetCiteData, setRenderEdit]);

  useEffect(() => {
    setCiteModalData(undefined);
    setRenderEdit(true);
  }, [appDetail._id, chatId, setCiteModalData, setRenderEdit]);

  const updateActiveTab = useCallback(
    (value: AgentChatTestTabEnum) => {
      if (value === AgentChatTestTabEnum.helper) {
        setHasRenderedHelper(true);
      }
      setAgentChatTestTab(value);
    },
    [setAgentChatTestTab, setHasRenderedHelper]
  );

  useEffect(() => {
    if (activeTab === AgentChatTestTabEnum.helper) {
      setHasRenderedHelper(true);
    }
  }, [activeTab, setHasRenderedHelper]);

  const { ChatContainer, restartChat } = useChatTest({
    ...workflowData,
    chatConfig: appForm.chatConfig,
    isReady: !isAgentSkillSandboxUnavailable
  });
  const onRestartChat = useCallback(() => {
    if (isAgentSkillSandboxUnavailable) {
      toast({
        status: 'warning',
        title: t('skill:sandbox_skill_unavailable_toast')
      });
      return;
    }
    if (activeTab === AgentChatTestTabEnum.helper) {
      ChatAgentHelperRef.current?.restartChat();
    } else {
      restartChat();
    }
  }, [activeTab, isAgentSkillSandboxUnavailable, restartChat, t, toast]);

  // 构建 ChatAgentHelper metadata，从 appForm 中提取配置。
  const chatAgentHelperMetadata = useMemo(
    () => ({
      systemPrompt: appForm.aiSettings.systemPrompt,
      selectedTools: appForm.selectedTools.map((tool) => tool.id),
      selectedDatasets: appForm.dataset.datasets.map((dataset) => dataset.datasetId),
      selectedAgentSkills: appForm.selectedAgentSkills || [],
      fileUpload: appForm.chatConfig.fileSelectConfig?.canSelectFile || false,
      enableSandbox: appForm.aiSettings.useAgentSandbox || false,
      modelConfig: {
        model: helperModel
      }
    }),
    [appForm, helperModel]
  );

  return (
    <Flex h={'full'} gap={2}>
      <MyBox
        flex={'1 0 0'}
        w={0}
        display={'flex'}
        position={'relative'}
        flexDirection={'column'}
        h={'full'}
        pt={4}
        pb={0}
        {...cardStyles}
        boxShadow={'3'}
      >
        <Flex px={[2, 5]} pb={2} alignItems={'center'}>
          <FillRowTabs<AgentChatTestTabEnum>
            py={1}
            list={[
              {
                label: t('app:helper_bot'),
                value: AgentChatTestTabEnum.helper
              },
              {
                label: t('app:chat_debug'),
                value: AgentChatTestTabEnum.chatDebug
              }
            ]}
            value={activeTab}
            onChange={(value) => {
              if (value === AgentChatTestTabEnum.helper && !canUseHelper) {
                setProModalOpen(true);
                return;
              }
              updateActiveTab(value);
            }}
          />

          <Box flex={1} />
          <Flex alignItems={'center'} gap={2}>
            <SandboxEntryIcon size={'smSquare'} onOpen={onOpenSandboxModal} />
            {activeTab === AgentChatTestTabEnum.chatDebug && (
              <ChatVariableButton chatType={ChatTypeEnum.test} />
            )}
            <MyTooltip label={t('common:core.chat.Restart')}>
              <IconButton
                className="chat"
                size={'smSquare'}
                icon={<MyIcon name={'common/clearLight'} w={'14px'} />}
                variant={'whiteDanger'}
                borderRadius={'md'}
                aria-label={'delete'}
                onClick={(e) => {
                  e.stopPropagation();
                  onRestartChat();
                }}
              />
            </MyTooltip>
          </Flex>
        </Flex>
        <Box flex={1} minH={0}>
          {hasRenderedHelper && (
            <Box h={'100%'} display={activeTab === AgentChatTestTabEnum.helper ? 'block' : 'none'}>
              <ChatAgentHelper
                ChatBoxRef={ChatAgentHelperRef}
                appId={appDetail._id}
                type={ChatAgentHelperTypeEnum.chatAgent}
                metadata={chatAgentHelperMetadata}
                InputLeftComponent={HelperModelSelectorInput}
                onApply={async (formData) => {
                  // Filter internal tools
                  const filteredToolIds = (formData.tools || []).filter(
                    (toolId) => !(toolId in systemSubInfo)
                  );

                  const newTools = await loadGeneratedTools({
                    newToolIds: filteredToolIds,
                    existsTools: appForm.selectedTools,
                    fileSelectConfig: appForm.chatConfig.fileSelectConfig
                  });

                  setAppForm((prev) => {
                    const fileUploadEnabled = !!formData.fileUploadEnabled;
                    const enableSandboxEnabled = !!formData.enableSandboxEnabled;

                    const newForm: AppFormEditFormType = {
                      ...prev,
                      selectedTools: [...newTools],
                      selectedAgentSkills: formData.selectedAgentSkills || [],
                      dataset: {
                        ...prev.dataset,
                        datasets: formData.datasets ?? []
                      },
                      aiSettings: {
                        ...prev.aiSettings,
                        systemPrompt: formData.systemPrompt || prev.aiSettings.systemPrompt,
                        useAgentSandbox:
                          enableSandboxEnabled || (formData.selectedAgentSkills?.length || 0) > 0
                      },
                      chatConfig: {
                        ...prev.chatConfig,
                        fileSelectConfig: fileUploadEnabled
                          ? {
                              ...prev.chatConfig.fileSelectConfig,
                              canSelectFile: true
                            }
                          : {
                              maxFiles: undefined,
                              canSelectFile: false,
                              customPdfParse: false,
                              canSelectImg: false,
                              canSelectVideo: false,
                              canSelectAudio: false,
                              canSelectCustomFileExtension: false,
                              customFileExtensionList: []
                            }
                      }
                    };
                    return newForm;
                  });
                }}
              />
            </Box>
          )}
          {activeTab === AgentChatTestTabEnum.chatDebug && <ChatContainer />}
        </Box>
      </MyBox>
      {datasetCiteData && (
        <Box flex={'1 0 0'} w={0} maxW={'560px'} {...cardStyles} boxShadow={'3'}>
          <ChatQuoteList
            rawSearch={datasetCiteData.rawSearch}
            metadata={datasetCiteData.metadata}
            onClose={() => setCiteModalData(undefined)}
          />
        </Box>
      )}

      <SandboxEditorModal />
      {!feConfigs?.isPlus && (
        <ProModal isOpen={proModalOpen} onClose={() => setProModalOpen(false)} />
      )}
    </Flex>
  );
};

const Render = ({ appForm, setAppForm, setRenderEdit, form2WorkflowFn }: Props) => {
  const { chatId } = useChatStore();
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const chatRecordProviderParams = useMemo(
    () => ({
      chatId: chatId,
      appId: appDetail._id
    }),
    [appDetail._id, chatId]
  );

  return (
    <ChatItemContextProvider
      showRouteToDatasetDetail={true}
      canDownloadSource={true}
      isShowCite={true}
      isShowFullText={true}
      showRunningStatus={true}
      showSkillReferences={true}
      showWholeResponse
    >
      <ChatRecordContextProvider params={chatRecordProviderParams}>
        <ChatTest
          appForm={appForm}
          setAppForm={setAppForm}
          setRenderEdit={setRenderEdit}
          form2WorkflowFn={form2WorkflowFn}
        />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};

export default React.memo(Render);
