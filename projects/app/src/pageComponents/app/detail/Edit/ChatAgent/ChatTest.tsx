import { Box, Flex, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useMemo, useRef } from 'react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';

import { useSafeState } from 'ahooks';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../context';
import { useChatTest } from '../../useChatTest';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { cardStyles } from '../../constants';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import VariablePopover from '@/components/core/chat/ChatContainer/components/VariablePopover';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import type { Form2WorkflowFnType } from '../FormComponent/type';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import HelperBot from '@/components/core/chat/HelperBot';
import type { HelperBotRefType } from '@/components/core/chat/HelperBot/context';
import { HelperBotTypeEnum } from '@fastgpt/global/core/chat/helperBot/type';
import { loadGeneratedTools } from './utils';
import { SubAppIds } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/constants';

type Props = {
  appForm: AppFormEditFormType;
  setAppForm: React.Dispatch<React.SetStateAction<AppFormEditFormType>>;
  setRenderEdit: React.Dispatch<React.SetStateAction<boolean>>;
  form2WorkflowFn: Form2WorkflowFnType;
};
const ChatTest = ({ appForm, setAppForm, setRenderEdit, form2WorkflowFn }: Props) => {
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useSafeState<'helper' | 'chat_debug'>('chat_debug');
  const HelperBotRef = useRef<HelperBotRefType>(null);

  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);
  // agentForm2AppWorkflow dependent allDatasets
  const isVariableVisible = useContextSelector(ChatItemContext, (v) => v.isVariableVisible);

  const [workflowData, setWorkflowData] = useSafeState({
    nodes: appDetail.modules || [],
    edges: appDetail.edges || []
  });

  useEffect(() => {
    const { nodes, edges } = form2WorkflowFn(appForm, t);
    setWorkflowData({ nodes, edges });
  }, [appForm, form2WorkflowFn, setWorkflowData, t]);

  useEffect(() => {
    setRenderEdit(!datasetCiteData);
  }, [datasetCiteData, setRenderEdit]);

  const { ChatContainer, restartChat } = useChatTest({
    ...workflowData,
    chatConfig: appForm.chatConfig,
    isReady: true
  });

  // 构建 TopAgent metadata,从 appForm 中提取配置
  const topAgentMetadata = useMemo(
    () => ({
      systemPrompt: appForm.aiSettings.systemPrompt,
      selectedTools: appForm.selectedTools.map((tool) => tool.id),
      selectedDatasets: appForm.dataset.datasets.map((dataset) => dataset.datasetId),
      fileUpload: appForm.chatConfig.fileSelectConfig?.canSelectFile || false,
      modelConfig: {
        model: appForm.aiSettings.model,
        temperature: appForm.aiSettings.temperature,
        maxToken: appForm.aiSettings.maxToken,
        stream: true
      }
    }),
    [appForm]
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
        py={4}
        {...cardStyles}
        boxShadow={'3'}
      >
        <Flex px={[2, 5]} pb={2}>
          <FillRowTabs<'helper' | 'chat_debug'>
            py={1}
            list={[
              {
                label: '辅助生成',
                value: 'helper'
              },
              {
                label: t('app:chat_debug'),
                value: 'chat_debug'
              }
            ]}
            value={activeTab}
            onChange={(value) => {
              setActiveTab(value);
            }}
          />

          {!isVariableVisible && activeTab === 'chat_debug' && (
            <VariablePopover chatType={ChatTypeEnum.test} />
          )}

          <Box flex={1} />
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
                if (activeTab === 'helper') {
                  HelperBotRef.current?.restartChat();
                } else {
                  restartChat();
                }
              }}
            />
          </MyTooltip>
        </Flex>
        <Box flex={1}>
          {activeTab === 'helper' && (
            <HelperBot
              ChatBoxRef={HelperBotRef}
              type={HelperBotTypeEnum.topAgent}
              metadata={topAgentMetadata}
              onApply={async (formData) => {
                const fileUploadEnabled = !!formData.fileUploadEnabled;
                // 过滤掉 file_read 不在 selected tools 中
                const filteredToolIds = (formData.tools || []).filter(
                  (toolId) => toolId !== SubAppIds.fileRead
                );
                const newTools = await loadGeneratedTools({
                  newToolIds: filteredToolIds,
                  existsTools: appForm.selectedTools,
                  fileSelectConfig: appForm.chatConfig.fileSelectConfig
                });

                setAppForm((prev) => {
                  const newForm: AppFormEditFormType = {
                    ...prev,
                    selectedTools: [...newTools],
                    aiSettings: {
                      ...prev.aiSettings,
                      systemPrompt: formData.systemPrompt || prev.aiSettings.systemPrompt
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
          )}
          {activeTab === 'chat_debug' && <ChatContainer />}
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
