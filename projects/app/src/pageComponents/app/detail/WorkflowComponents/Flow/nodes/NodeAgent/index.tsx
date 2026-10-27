import { Box, Button, Flex, Grid, HStack, Switch, useDisclosure } from '@chakra-ui/react';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import React, { useCallback, useMemo } from 'react';
import { type NodeProps } from 'reactflow';
import { useContextSelector } from 'use-context-selector';

import Container from '../../components/Container';
import IOTitle from '../../components/IOTitle';
import NodeCard from '../render/NodeCard';
import RenderInput from '../render/RenderInput';
import InputLabel from '../render/RenderInput/Label';
import RenderOutput from '../render/RenderOutput';
import CatchError from '../render/RenderOutput/CatchError';
import RenderToolInput, { hasDynamicToolInput } from '../render/RenderToolInput';

import { AppContext } from '@/pageComponents/app/detail/context';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import { WorkflowBufferDataContext } from '../../../context/workflowInitContext';
import { WorkflowUtilsContext } from '../../../context/workflowUtilsContext';

import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { getEditorVariables } from '../../../utils';
import { useWorkflowQuoteLimit } from '../../hooks/useWorkflowQuoteLimit';

import OptimizerPopover from '@/components/common/PromptEditor/OptimizerPopover';
import { useAgentSkillManager } from './useAgentSkillManager';
import { restoreDatasetParams } from './utils';

import DatasetCard from '@/components/core/app/DatasetCard';
import SelectedToolCard from '@/components/core/app/SelectedToolCard';
import SkillCard from '@/components/core/app/SkillCard';
import { RechargeModal } from '@/components/support/wallet/NotSufficientModal';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getToolIdentityKey } from '@fastgpt/global/core/app/tool/utils';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { getSelectedInputRenderType } from '@fastgpt/global/common/workflow/reference';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useToast } from '@fastgpt/web/hooks/useToast';
import WorkflowSandboxConfig, {
  createSandboxEntrypointInput
} from '../components/WorkflowSandboxConfig';

const PromptEditor = dynamic(() => import('@fastgpt/web/components/common/Textarea/PromptEditor'));
const SkillSelectModal = dynamic(
  () => import('@/pageComponents/app/detail/Edit/FormComponent/ToolSelector/SkillSelectModal')
);
const ToolSelectModal = dynamic(
  () => import('@/pageComponents/app/detail/Edit/FormComponent/ToolSelector/ToolSelectModal')
);
const ReferenceRender = dynamic(() => import('../render/RenderInput/templates/Reference'));
const DatasetParamsModal = dynamic(() => import('@/components/core/app/DatasetParamsModal'));
const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));

/* ======== Helper: get current renderType of an input ======== */
const getRenderType = (input: FlowNodeInputItemType) =>
  getSelectedInputRenderType(input) || FlowNodeInputTypeEnum.custom;

const agentModelSettingProps = {
  showMaxToken: true,
  showTemperature: false,
  showTopP: false,
  showStopSign: false,
  showResponseFormat: false,
  showMultimodalConfig: true
};

// 聊天记录轮数与文件链接均不在节点上配置，与 Agent V2 表单保持一致：
// 文件链接是内置输入，由流程开始节点自动引用 userFiles；存量节点若仍有这些输入也不展示。
const hiddenInputKeys = new Set<NodeInputKeyEnum>([
  NodeInputKeyEnum.history,
  NodeInputKeyEnum.fileUrlList
]);

// AI 配置弹窗会读写这些输入。hidden 输入不渲染，但必须一并传给设置组件，否则修改无法写回节点。
const aiSettingInputKeys = new Set<NodeInputKeyEnum>([
  NodeInputKeyEnum.aiModelId,
  NodeInputKeyEnum.aiModel,
  NodeInputKeyEnum.aiChatTemperature,
  NodeInputKeyEnum.aiChatMaxToken,
  NodeInputKeyEnum.aiChatIsResponseText,
  NodeInputKeyEnum.aiChatVision,
  NodeInputKeyEnum.aiChatAudio,
  NodeInputKeyEnum.aiChatVideo,
  NodeInputKeyEnum.aiChatExtractFiles,
  NodeInputKeyEnum.aiChatReasoning,
  NodeInputKeyEnum.aiChatReasoningEffort,
  NodeInputKeyEnum.aiChatTopP,
  NodeInputKeyEnum.aiChatStopSign,
  NodeInputKeyEnum.aiChatResponseFormat,
  NodeInputKeyEnum.aiChatJsonSchema
]);

const ManualInputLabel = React.memo(function ManualInputLabel({
  input
}: {
  input: FlowNodeInputItemType;
}) {
  const { t } = useTranslation();

  return (
    <Flex className="nodrag" cursor={'default'} alignItems={'center'}>
      <FormLabel color={'myGray.600'}>{t(input.label as any)}</FormLabel>
    </Flex>
  );
});

// 与 dashboard/ListCreateCard 的新建卡片保持同一虚线规范（#7895FE、6/6 圆头、12px 圆角）。
const CREATE_CARD_DASHED_BORDER = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25' viewBox='0 0 330 56' preserveAspectRatio='none'%3E%3Crect x='0.5' y='0.5' width='329' height='55' rx='12' fill='none' stroke='%237895FE' stroke-width='1' stroke-dasharray='6 6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;

/**
 * 技能 / 工具 / 知识库统一的添加态按钮。
 * 保持 40px 紧凑高度，视觉 token 对齐 dashboard 的 ListCreateCard。
 */
const ResourceSelectButton = ({
  onClick,
  children
}: {
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <Button
    variant={'transparentBase'}
    h={10}
    w={'100%'}
    bg={'white'}
    color={'myGray.900'}
    border={'none'}
    borderRadius={'10px'}
    boxShadow={'none'}
    leftIcon={<MyIcon name={'common/addLight'} w={'18px'} color={'#7895FE'} />}
    _hover={{ bg: 'primary.50' }}
    _active={{ bg: 'primary.50' }}
    sx={{
      backgroundImage: CREATE_CARD_DASHED_BORDER,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
      backgroundSize: '100% 100%'
    }}
    onClick={onClick}
  >
    {children}
  </Button>
);

// TODO: 待优化，不一定需要重写，用模板渲染也可以
const NodeAgent = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { nodeId, catchError, inputs, outputs } = data;
  const { t } = useTranslation();
  const { toast } = useToast();

  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const { splitToolInputs, splitOutput } = useContextSelector(WorkflowUtilsContext, (ctx) => ctx);
  const { getNodeById, edges } = useContextSelector(WorkflowBufferDataContext, (v) => v);
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const { feConfigs } = useSystemStore();
  const llmMaxQuoteContext = useWorkflowQuoteLimit();
  const externalProviderWorkflowVariables = feConfigs?.externalProviderWorkflowVariables;
  const { teamPlanStatus, isTeamAdmin } = useUserStore();
  const enableSandbox = !teamPlanStatus?.standard || !!teamPlanStatus?.standard?.enableSandbox;
  const showSandbox = feConfigs.show_agent_sandbox;
  const { openConfirm, ConfirmModal } = useConfirm();

  // Split tool/common inputs and outputs
  const { isTool, commonInputs } = useMemoEnhance(
    () => splitToolInputs(inputs, nodeId),
    [inputs, nodeId, splitToolInputs]
  );
  const { successOutputs, errorOutputs } = useMemoEnhance(
    () => splitOutput(outputs),
    [splitOutput, outputs]
  );

  // Editor variables for PromptEditor
  const editorVariables = useMemoEnhance(
    () =>
      getEditorVariables({
        nodeId,
        getNodeById,
        edges,
        appDetail,
        t
      }),
    [nodeId, getNodeById, edges, appDetail, t]
  );
  const externalVariables = useMemo(
    () =>
      externalProviderWorkflowVariables?.map((item) => ({
        key: item.key,
        label: item.name
      })) || [],
    [externalProviderWorkflowVariables]
  );
  const allVariables = useMemo(
    () => [...(editorVariables || []), ...(externalVariables || [])],
    [editorVariables, externalVariables]
  );

  // 节点 inputs 是已保存参数的唯一来源；弹窗自行维护草稿，避免本地副本遗漏模型 ID。
  const datasetParamsData = useMemo(
    () =>
      restoreDatasetParams({
        state: {
          searchMode: DatasetSearchModeEnum.embedding,
          embeddingWeight: 0.5,
          limit: 3000,
          similarity: 0.5,
          usingReRank: true,
          rerankModelId: undefined,
          rerankWeight: 0.6,
          datasetSearchUsingExtensionQuery: false,
          datasetSearchExtensionModelId: undefined,
          datasetSearchExtensionBg: ''
        },
        inputs
      }),
    [inputs]
  );
  const {
    isOpen: isOpenDatasetParams,
    onOpen: onOpenDatasetParams,
    onClose: onCloseDatasetParams
  } = useDisclosure();
  const {
    isOpen: isOpenDatasetSelect,
    onOpen: onOpenDatasetSelect,
    onClose: onCloseDatasetSelect
  } = useDisclosure();

  // ---- Prompt ----
  const promptInput = useMemo(
    () => inputs.find((i) => i.key === NodeInputKeyEnum.aiSystemPrompt),
    [inputs]
  );
  const skillsInput = useMemo(
    () => inputs.find((i) => i.key === NodeInputKeyEnum.skills),
    [inputs]
  );
  const sandboxInput = useMemo(
    () => inputs.find((i) => i.key === NodeInputKeyEnum.useAgentSandbox),
    [inputs]
  );
  const sandboxEntrypointInput = useMemo(
    () => inputs.find((i) => i.key === NodeInputKeyEnum.sandboxEntrypoint),
    [inputs]
  );
  const toolsInput = useMemo(
    () => inputs.find((i) => i.key === NodeInputKeyEnum.selectedTools),
    [inputs]
  );

  // Split commonInputs into groups
  const manualKeys = useMemo(
    () =>
      new Set([
        NodeInputKeyEnum.aiModelId,
        NodeInputKeyEnum.aiModel,
        NodeInputKeyEnum.aiSystemPrompt,
        NodeInputKeyEnum.skills,
        NodeInputKeyEnum.useAgentSandbox,
        NodeInputKeyEnum.sandboxEntrypoint,
        NodeInputKeyEnum.selectedTools
      ]),
    []
  );
  const modelInputs = useMemo(
    () => commonInputs.filter((i) => aiSettingInputKeys.has(i.key as NodeInputKeyEnum)),
    [commonInputs]
  );
  // Inputs rendered after the dataset section (userChatInput)
  const chatInputKeys = useMemo(() => new Set([NodeInputKeyEnum.userChatInput]), []);
  const chatInputs = useMemo(
    () => commonInputs.filter((i) => chatInputKeys.has(i.key as NodeInputKeyEnum)),
    [commonInputs, chatInputKeys]
  );
  // Inputs rendered after skills/tools (dataset, etc.)
  const datasetInputs = useMemo(
    () =>
      commonInputs.filter(
        (i) =>
          !manualKeys.has(i.key as NodeInputKeyEnum) &&
          !chatInputKeys.has(i.key as NodeInputKeyEnum) &&
          !hiddenInputKeys.has(i.key as NodeInputKeyEnum)
      ),
    [commonInputs, manualKeys, chatInputKeys]
  );
  // Separate datasetSelectList from other dataset inputs
  const datasetSelectInput = useMemo(
    () => datasetInputs.find((i) => i.key === NodeInputKeyEnum.datasetSelectList),
    [datasetInputs]
  );
  const selectedDatasets = useMemo(
    () => (Array.isArray(datasetSelectInput?.value) ? datasetSelectInput!.value : []),
    [datasetSelectInput]
  );
  const onClickDatasetSearch = useCallback(() => {
    if (selectedDatasets.length > 0) {
      onOpenDatasetParams();
      return;
    }

    onOpenDatasetSelect();
  }, [onOpenDatasetParams, onOpenDatasetSelect, selectedDatasets.length]);
  const onDeleteDataset = useCallback(
    (datasetId: string) => {
      if (!datasetSelectInput) return;
      onChangeNode({
        nodeId,
        key: NodeInputKeyEnum.datasetSelectList,
        type: 'updateInput',
        value: {
          ...datasetSelectInput,
          value: selectedDatasets.filter((dataset) => dataset.datasetId !== datasetId)
        }
      });
    },
    [datasetSelectInput, nodeId, onChangeNode, selectedDatasets]
  );

  // ---- Skills ----
  const {
    isOpen: isOpenSkillSelect,
    onOpen: onOpenSkillSelect,
    onClose: onCloseSkillSelect
  } = useDisclosure();
  const {
    isOpen: isOpenRecharge,
    onOpen: onOpenRecharge,
    onClose: onCloseRecharge
  } = useDisclosure();
  const hasSelectedAgentSkills = Array.isArray(skillsInput?.value) && skillsInput.value.length > 0;

  /** 技能运行依赖虚拟机：系统未配置或套餐不支持时给出提示并中止。 */
  const checkSkillSandboxAvailable = useCallback(() => {
    if (!showSandbox) {
      toast({
        status: 'warning',
        title: t('skill:sandbox_skill_system_not_configured_toast')
      });
      return false;
    }
    if (!enableSandbox) {
      openConfirm({
        title: t('skill:sandbox_plan_not_supported_title'),
        customContent: t('skill:sandbox_skill_plan_not_supported_content'),
        onConfirm: isTeamAdmin ? onOpenRecharge : undefined,
        confirmText: isTeamAdmin ? t('skill:sandbox_upgrade_action') : t('common:Close'),
        cancelText: t('common:Close'),
        showCancel: isTeamAdmin
      })();
      return false;
    }
    return true;
  }, [enableSandbox, isTeamAdmin, onOpenRecharge, openConfirm, showSandbox, t, toast]);

  const onChangeAgentSandbox = useCallback(
    (checked: boolean) => {
      if (!sandboxInput) return;
      if (checked) {
        if (!showSandbox) {
          toast({
            status: 'warning',
            title: t('skill:sandbox_system_not_configured_toast')
          });
          return;
        }
        if (!enableSandbox) {
          toast({
            status: 'warning',
            title: t('app:sandbox_free_not_support')
          });
          return;
        }
      }
      if (!checked && enableSandbox && hasSelectedAgentSkills) {
        toast({
          status: 'warning',
          title: t('skill:sandbox_disable_blocked_toast')
        });
        return;
      }

      onChangeNode({
        nodeId,
        key: NodeInputKeyEnum.useAgentSandbox,
        type: 'updateInput',
        value: {
          ...sandboxInput,
          value: checked
        }
      });
    },
    [
      enableSandbox,
      hasSelectedAgentSkills,
      nodeId,
      onChangeNode,
      sandboxInput,
      showSandbox,
      t,
      toast
    ]
  );

  // Skill manager (for PromptEditor @ integration)
  const {
    selectedTools,
    skillOption,
    selectedSkills,
    selectedAgentSkills,
    canUploadFile,
    onClickSkill,
    onConfigTool,
    onRemoveSkill,
    onUpdateOrAddTool,
    onDeleteTool,
    onAddAgentSkill,
    onRemoveAgentSkill,
    SkillModal
  } = useAgentSkillManager({
    nodeId,
    inputs,
    onClickDatasetSearch,
    checkSkillSandboxAvailable,
    onChangeAgentSandbox
  });

  const openSkillSelect = useCallback(() => {
    if (!checkSkillSandboxAvailable()) return;
    onOpenSkillSelect();
  }, [checkSkillSandboxAvailable, onOpenSkillSelect]);

  const datasetOtherInputs = useMemo(
    () =>
      datasetInputs.filter(
        (i) =>
          i.key !== NodeInputKeyEnum.datasetSelectList &&
          i.key !== NodeInputKeyEnum.datasetParams &&
          i.key !== NodeInputKeyEnum.datasetSimilarity &&
          i.key !== NodeInputKeyEnum.authTmbId
      ),
    [datasetInputs]
  );
  const authTmbIdInput = useMemo(
    () => datasetInputs.find((i) => i.key === NodeInputKeyEnum.authTmbId),
    [datasetInputs]
  );

  const onChangeAuthTmbId = useCallback(
    (checked: boolean) => {
      if (!authTmbIdInput) return;
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: NodeInputKeyEnum.authTmbId,
        value: {
          ...authTmbIdInput,
          value: checked
        }
      });
    },
    [authTmbIdInput, nodeId, onChangeNode]
  );

  // ---- Prompt ----
  const onPromptChange = useCallback(
    (text: string) => {
      if (!promptInput) return;
      onChangeNode({
        nodeId,
        key: NodeInputKeyEnum.aiSystemPrompt,
        type: 'updateInput',
        value: { ...promptInput, value: text }
      });
    },
    [promptInput, nodeId, onChangeNode]
  );
  const promptRenderType = useMemo(() => {
    if (!promptInput) return FlowNodeInputTypeEnum.textarea;
    return getRenderType(promptInput);
  }, [promptInput]);
  const PromptSkillTip = useMemo(
    () =>
      promptRenderType === FlowNodeInputTypeEnum.textarea ? (
        <HStack fontSize={'11px'} spacing={1} color={'myGray.500'}>
          <MyIcon name={'common/info'} w={'0.8rem'} />
          <Box>{t('workflow:agent.prompt_skill_tip')}</Box>
        </HStack>
      ) : undefined,
    [promptRenderType, t]
  );
  const OptimizerPopoverComponent = useCallback(
    ({ iconButtonStyle }: { iconButtonStyle: Record<string, any> }) => (
      <OptimizerPopover
        iconButtonStyle={iconButtonStyle}
        defaultPrompt={promptInput?.value}
        onChangeText={onPromptChange}
      />
    ),
    [promptInput?.value, onPromptChange]
  );

  // ---- Tools ----
  const {
    isOpen: isOpenToolSelect,
    onOpen: onOpenToolSelect,
    onClose: onCloseToolSelect
  } = useDisclosure();

  return (
    <NodeCard minW={'524px'} selected={selected} {...data}>
      {isTool && hasDynamicToolInput(data) && (
        <Container>
          <RenderToolInput nodeId={nodeId} inputs={inputs} />
        </Container>
      )}

      <Container>
        <IOTitle text={t('common:Input')} nodeId={nodeId} inputs={inputs} />

        {/* 1. Model settings */}
        {modelInputs.length > 0 && (
          <RenderInput
            nodeId={nodeId}
            flowInputList={modelInputs}
            settingLLMModelProps={agentModelSettingProps}
          />
        )}

        {/* 2. System prompt */}
        {promptInput && (
          <Box position={'relative'} mb={5}>
            <InputLabel nodeId={nodeId} input={promptInput} RightComponent={PromptSkillTip} />
            <Box mt={2} className={'nodrag'}>
              {promptRenderType === FlowNodeInputTypeEnum.textarea ? (
                <PromptEditor
                  minH={160}
                  bg={'myGray.50'}
                  title={t('common:core.ai.Prompt')}
                  isRichText={true}
                  showOpenModal={true}
                  value={promptInput.value || ''}
                  onChange={onPromptChange}
                  variables={allVariables}
                  variableLabels={editorVariables}
                  skillOption={skillOption}
                  selectedSkills={selectedSkills}
                  onClickSkill={onClickSkill}
                  onRemoveSkill={onRemoveSkill}
                  ExtensionPopover={[OptimizerPopoverComponent]}
                  placeholder={[
                    promptInput.placeholder ? t(promptInput.placeholder as any) : '',
                    t('workflow:agent.prompt_placeholder')
                  ]
                    .filter(Boolean)
                    .join('\n')}
                />
              ) : (
                <ReferenceRender inputs={inputs} item={promptInput} nodeId={nodeId} />
              )}
            </Box>
          </Box>
        )}

        {/* 3. Sandbox config */}
        <WorkflowSandboxConfig
          nodeId={nodeId}
          sandboxInput={sandboxInput}
          sandboxEntrypointInput={sandboxEntrypointInput}
          showSandbox={!!showSandbox}
          enableSandbox={enableSandbox}
          isPlus={feConfigs?.isPlus}
          onChangeSandbox={onChangeAgentSandbox}
          onChangeEntrypoint={(value) => {
            onChangeNode({
              nodeId,
              key: NodeInputKeyEnum.sandboxEntrypoint,
              type: 'replaceInput',
              value: sandboxEntrypointInput
                ? {
                    ...sandboxEntrypointInput,
                    value
                  }
                : createSandboxEntrypointInput(value)
            });
          }}
        />

        {/* 4. Skills section (manual selection) */}
        {skillsInput && (
          <Box mb={5}>
            <ManualInputLabel input={skillsInput} />
            <Box mt={2} className={'nodrag'}>
              <Grid
                gridTemplateColumns={'repeat(2, minmax(0, 1fr))'}
                gridGap={4}
                minW={'350px'}
                w={'100%'}
              >
                <ResourceSelectButton onClick={openSkillSelect}>
                  {t('workflow:agent.add_skill')}
                </ResourceSelectButton>
                {selectedAgentSkills.map((item) => (
                  <SkillCard
                    key={item.skillId}
                    skill={item}
                    avatarSize={'18px'}
                    nameFontWeight={'bold'}
                    flexProps={{
                      h: 10,
                      px: 2,
                      boxShadow: 'sm'
                    }}
                    onDelete={() => onRemoveAgentSkill(item.skillId)}
                  />
                ))}
              </Grid>
              {isOpenSkillSelect && (
                <SkillSelectModal
                  selectedSkills={selectedAgentSkills}
                  onAddSkill={onAddAgentSkill}
                  onRemoveSkill={onRemoveAgentSkill}
                  onClose={onCloseSkillSelect}
                />
              )}
            </Box>
          </Box>
        )}

        {/* 5. Tools section (manual selection) */}
        {toolsInput && (
          <Box mb={5}>
            <ManualInputLabel input={toolsInput} />
            <Box mt={2} className={'nodrag'}>
              <Grid
                gridTemplateColumns={'repeat(2, minmax(0, 1fr))'}
                gridGap={4}
                minW={'350px'}
                w={'100%'}
              >
                <ResourceSelectButton onClick={onOpenToolSelect}>
                  {t('app:Add_tool')}
                </ResourceSelectButton>
                {selectedTools.map((item) => (
                  <SelectedToolCard
                    key={getToolIdentityKey(item.pluginId || item.id, item.source)}
                    tool={item}
                    onConfig={onConfigTool}
                    onDelete={(tool) => onDeleteTool(tool.pluginId ?? tool.id, tool.source)}
                  />
                ))}
              </Grid>
              {isOpenToolSelect && (
                <ToolSelectModal
                  selectedTools={selectedTools}
                  fileSelectConfig={canUploadFile ? { canSelectFile: true } : {}}
                  onAddTool={(tool) => onUpdateOrAddTool({ ...tool, id: tool.pluginId ?? tool.id })}
                  onRemoveTool={(tool) => onDeleteTool(tool.id, tool.source)}
                  onClose={onCloseToolSelect}
                />
              )}
            </Box>
          </Box>
        )}

        {/* 6. Dataset inputs (datasetSelectList, datasetParams, etc.) */}
        {(datasetSelectInput || datasetOtherInputs.length > 0) && (
          <Box mb={5}>
            {datasetSelectInput && (
              <Box>
                <Flex className="nodrag" cursor={'default'} alignItems={'center'}>
                  <FormLabel color={'myGray.600'}>{t('common:core.dataset.Dataset')}</FormLabel>
                  {feConfigs?.isPlus && authTmbIdInput && (
                    <Flex ml={2} alignItems={'center'}>
                      <Box fontSize={'sm'} color={'myGray.600'} whiteSpace={'nowrap'}>
                        {t('workflow:auth_tmb_id')}
                      </Box>
                      <QuestionTip ml={1} label={t('workflow:auth_tmb_id_tip')} />
                      <Switch
                        ml={1}
                        size={'sm'}
                        isChecked={!!authTmbIdInput.value}
                        onChange={(e) => onChangeAuthTmbId(e.target.checked)}
                      />
                    </Flex>
                  )}
                  <MyTooltip label={t('workflow:params_setting')}>
                    <Box
                      ml={2}
                      display={'inline-flex'}
                      alignItems={'center'}
                      cursor={'pointer'}
                      color={'myGray.500'}
                      _hover={{ color: 'primary.600' }}
                      onClick={onOpenDatasetParams}
                    >
                      <MyIcon name={'common/settingLight'} w={'16px'} />
                    </Box>
                  </MyTooltip>
                </Flex>
                <Box mt={2} className={'nodrag'}>
                  <Grid
                    gridTemplateColumns={'repeat(2, minmax(0, 1fr))'}
                    gridGap={4}
                    minW={'350px'}
                    w={'100%'}
                  >
                    <ResourceSelectButton onClick={onOpenDatasetSelect}>
                      {t('common:core.chat.Select dataset')}
                    </ResourceSelectButton>
                    {selectedDatasets.map((dataset) => (
                      <DatasetCard
                        key={dataset.datasetId}
                        dataset={dataset}
                        onDelete={onDeleteDataset}
                      />
                    ))}
                  </Grid>
                  {isOpenDatasetSelect && (
                    <DatasetSelectModal
                      defaultSelectedDatasets={selectedDatasets.map((d) => ({
                        datasetId: d.datasetId,
                        name: d.name,
                        avatar: d.avatar,
                        vectorModel: d.vectorModel,
                        error: d.error
                      }))}
                      onChange={(e) => {
                        if (!datasetSelectInput) return;
                        onChangeNode({
                          nodeId,
                          key: NodeInputKeyEnum.datasetSelectList,
                          type: 'updateInput',
                          value: { ...datasetSelectInput, value: e }
                        });
                      }}
                      onClose={onCloseDatasetSelect}
                    />
                  )}
                </Box>
              </Box>
            )}
            {datasetOtherInputs.length > 0 && (
              <RenderInput nodeId={nodeId} flowInputList={datasetOtherInputs} isTool={isTool} />
            )}
          </Box>
        )}

        {/* 7. Chat input (userChatInput) */}
        {chatInputs.length > 0 && (
          <RenderInput nodeId={nodeId} flowInputList={chatInputs} isTool={isTool} />
        )}
      </Container>

      {successOutputs.length > 0 && (
        <Container>
          <IOTitle text={t('common:Output')} nodeId={nodeId} catchError={catchError} />
          <RenderOutput nodeId={nodeId} flowOutputList={successOutputs} />
        </Container>
      )}
      {catchError && <CatchError nodeId={nodeId} errorOutputs={errorOutputs} />}

      <SkillModal />

      <ConfirmModal />
      {isOpenRecharge && (
        <RechargeModal
          onClose={onCloseRecharge}
          onPaySuccess={() => {
            onCloseRecharge();
          }}
        />
      )}

      {isOpenDatasetParams && (
        <DatasetParamsModal
          {...datasetParamsData}
          maxTokens={llmMaxQuoteContext}
          onClose={onCloseDatasetParams}
          onSuccess={(e) => {
            for (const key in e) {
              const item = inputs.find((input) => input.key === key);
              if (!item) continue;
              onChangeNode({
                nodeId,
                type: 'updateInput',
                key,
                value: { ...item, value: (e as any)[key] }
              });
            }
          }}
        />
      )}
    </NodeCard>
  );
};

export default React.memo(NodeAgent);
