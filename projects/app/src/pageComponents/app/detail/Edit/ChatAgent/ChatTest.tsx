import { Box, Flex, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useMemo } from 'react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';

import { useSafeState } from 'ahooks';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/type';
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
import { HelperBotTypeEnum } from '@fastgpt/global/core/chat/helperBot/type';
import { getToolPreviewNode } from '@/web/core/app/api/tool';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import { useToast } from '@fastgpt/web/hooks/useToast';

type Props = {
  appForm: AppFormEditFormType;
  setAppForm?: React.Dispatch<React.SetStateAction<AppFormEditFormType>>;
  setRenderEdit: React.Dispatch<React.SetStateAction<boolean>>;
  form2WorkflowFn: Form2WorkflowFnType;
};
const ChatTest = ({ appForm, setAppForm, setRenderEdit, form2WorkflowFn }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useSafeState<'helper' | 'chat_debug'>('helper');

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
  }, [appForm, setWorkflowData, t]);

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
      role: appForm.aiSettings.aiRole,
      taskObject: appForm.aiSettings.aiTaskObject,
      selectedTools: appForm.selectedTools.map((tool) => tool.id),
      selectedDatasets: appForm.dataset.datasets.map((dataset) => dataset.datasetId),
      fileUpload: false, // TODO: 从配置中获取文件上传设置
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
                restartChat();
              }}
            />
          </MyTooltip>
        </Flex>
        <Box flex={1}>
          {activeTab === 'helper' && (
            <HelperBot
              type={HelperBotTypeEnum.topAgent}
              metadata={topAgentMetadata}
              onApply={async (formData) => {
                console.log('🎨 ChatTest 收到 onApply 回调:', formData);
                if (!setAppForm) {
                  console.warn('⚠️ setAppForm 未传入，无法更新表单');
                  return;
                }

                // 1. 过滤已存在的工具ID
                const existingToolIds = new Set(
                  appForm.selectedTools.map((tool) => tool.pluginId).filter(Boolean)
                );

                console.log('📋 当前已存在的工具 pluginId:', Array.from(existingToolIds));
                console.log('📋 formData.selectedTools:', formData.selectedTools);

                const newToolIds = (formData.selectedTools || []).filter(
                  (toolId: string) => !existingToolIds.has(toolId)
                );

                console.log('📋 过滤后的新工具ID:', newToolIds);

                if (newToolIds.length === 0) {
                  console.log('📋 没有新工具需要添加,全部已存在');
                  // 仍然更新 role 和 taskObject
                  setAppForm((prev) => ({
                    ...prev,
                    aiSettings: {
                      ...prev.aiSettings,
                      aiRole: formData.role || '',
                      aiTaskObject: formData.taskObject || ''
                    }
                  }));
                  return;
                }

                console.log(`📦 过滤后需要添加 ${newToolIds.length} 个新工具:`, newToolIds);

                // 2. 批量获取工具详细信息
                let newTools: FlowNodeTemplateType[] = [];
                const failedToolIds: string[] = [];

                // 使用 Promise.allSettled 并行请求所有工具
                const toolPromises = newToolIds.map((toolId: string) =>
                  getToolPreviewNode({ appId: toolId })
                    .then((tool) => ({ status: 'fulfilled' as const, toolId, tool }))
                    .catch((error) => ({ status: 'rejected' as const, toolId, error }))
                );

                const results = await Promise.allSettled(toolPromises);

                // 3. 处理结果
                results.forEach((result: any) => {
                  if (result.status === 'fulfilled' && result.value.status === 'fulfilled') {
                    newTools.push(result.value.tool);
                  } else if (result.status === 'fulfilled' && result.value.status === 'rejected') {
                    failedToolIds.push(result.value.toolId);
                    console.error(`❌ 工具 ${result.value.toolId} 获取失败:`, result.value.error);
                  }
                });

                console.log(
                  `✅ 成功获取 ${newTools.length} 个工具, 失败 ${failedToolIds.length} 个`
                );

                // 4. 如果有失败的工具,显示警告
                if (failedToolIds.length > 0) {
                  toast({
                    title: t('app:tool_load_failed'),
                    description: `${t('app:failed_tools')}: ${failedToolIds.join(', ')}`,
                    status: 'warning',
                    duration: 5000
                  });
                }

                // 5. 更新 appForm
                setAppForm((prev) => {
                  console.log('📝 更新前的 appForm:', prev);

                  const newForm: AppFormEditFormType = {
                    ...prev,
                    aiSettings: {
                      ...prev.aiSettings,
                      aiRole: formData.role || '',
                      aiTaskObject: formData.taskObject || ''
                    },
                    selectedTools: [...prev.selectedTools, ...newTools]
                  };

                  console.log('✅ 更新后的 appForm:', newForm);
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
      isShowReadRawSource={true}
      isResponseDetail={true}
      showNodeStatus
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
