import {
  getSelectedInputRenderType,
  nodeInputIsReference
} from '@fastgpt/global/common/workflow/reference';
import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type {
  SelectedAgentSkillItemType,
  SelectedToolItemType
} from '@fastgpt/global/core/app/formEdit/type';
import { getToolIdentityKey } from '@fastgpt/global/core/app/tool/utils';
import { useTranslation } from 'next-i18next';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useAgentSkillSelect } from '@/pageComponents/app/detail/Edit/ChatAgent/hooks/useAgentSkillSelect';
import { useSkillManager } from '@/pageComponents/app/detail/Edit/ChatAgent/hooks/useSkillManager';
import { RechargeModal } from '@/components/support/wallet/NotSufficientModal';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import { WorkflowBufferDataContext } from '../../../context/workflowInitContext';
import { getEditorVariables } from '../../../utils';

/** 仅适配 Agent 节点的输入更新、提示词资源和共享选择逻辑，不维护另一套表单渲染。 */
const useAgentNodeInputs = ({ nodeId, inputs }: FlowNodeItemType) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const { getNodeById, edges } = useContextSelector(WorkflowBufferDataContext, (v) => v);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus } = useUserStore();
  const inputMap = useMemo(() => new Map(inputs.map((input) => [input.key, input])), [inputs]);
  const selectedTools = useMemo<SelectedToolItemType[]>(() => {
    const value = inputMap.get(NodeInputKeyEnum.selectedTools)?.value;
    return Array.isArray(value) ? value : [];
  }, [inputMap]);
  const selectedAgentSkills = useMemo<SelectedAgentSkillItemType[]>(() => {
    const value = inputMap.get(NodeInputKeyEnum.skills)?.value;
    return Array.isArray(value) ? value : [];
  }, [inputMap]);
  const datasetInput = inputMap.get(NodeInputKeyEnum.datasetSelectList);
  const datasets = datasetInput?.value;
  const useAgentSandbox = Boolean(inputMap.get(NodeInputKeyEnum.useAgentSandbox)?.value);

  const updateInputs = useCallback(
    (values: Record<string, unknown>) => {
      onChangeNode(
        Object.entries(values).flatMap(([key, value]) => {
          const input = inputMap.get(key);
          return input
            ? [{ nodeId, key, type: 'updateInput' as const, value: { ...input, value } }]
            : [];
        })
      );
    },
    [inputMap, nodeId, onChangeNode]
  );
  const onUpdateSkills = useCallback(
    (
      update: (skills: SelectedAgentSkillItemType[]) => SelectedAgentSkillItemType[],
      enableSandbox?: boolean
    ) => {
      updateInputs({
        [NodeInputKeyEnum.skills]: update(selectedAgentSkills),
        ...(enableSandbox ? { [NodeInputKeyEnum.useAgentSandbox]: true } : {})
      });
    },
    [selectedAgentSkills, updateInputs]
  );
  const onUpdateSandbox = useCallback(
    (checked: boolean) => {
      updateInputs({ [NodeInputKeyEnum.useAgentSandbox]: checked });
    },
    [updateInputs]
  );
  const skillSelection = useAgentSkillSelect({
    selectedAgentSkills,
    useAgentSandbox,
    showSandbox: feConfigs.show_agent_sandbox,
    enableSandbox: !teamPlanStatus?.standard || !!teamPlanStatus.standard.enableSandbox,
    onUpdateSkills,
    onUpdateSandbox
  });

  /** 异步工具预览可能保留旧回调，写入时读取当前列表和输入定义，保留期间的编辑。 */
  const updateTools = useCallback(
    (update: (tools: SelectedToolItemType[]) => SelectedToolItemType[]) => {
      const input = getNodeById(nodeId)?.inputs.find(
        (input) => input.key === NodeInputKeyEnum.selectedTools
      );
      if (!input) return;

      const tools: SelectedToolItemType[] = Array.isArray(input.value) ? input.value : [];
      onChangeNode({
        nodeId,
        key: NodeInputKeyEnum.selectedTools,
        type: 'updateInput',
        value: { ...input, value: update(tools) }
      });
    },
    [getNodeById, nodeId, onChangeNode]
  );

  const onUpdateOrAddTool = useCallback(
    (tool: SelectedToolItemType) => {
      const id = tool.pluginId ?? tool.id;
      const nextTool = { ...tool, id, pluginId: id };
      const key = getToolIdentityKey(id, tool.source);
      const matches = (item: SelectedToolItemType) =>
        getToolIdentityKey(item.pluginId ?? item.id, item.source) === key;
      updateTools((tools) =>
        tools.some(matches)
          ? tools.map((item) => (matches(item) ? nextTool : item))
          : [nextTool, ...tools]
      );
    },
    [updateTools]
  );
  const onDeleteTool = useCallback(
    (id: string, source?: string) => {
      const key = getToolIdentityKey(id, source);
      updateTools((tools) =>
        tools.filter((tool) => getToolIdentityKey(tool.pluginId ?? tool.id, tool.source) !== key)
      );
    },
    [updateTools]
  );

  // 引用模式的知识库在运行时解析；已配置引用也应启用提示词中的知识库能力标签。
  const hasSelectedDataset =
    Array.isArray(datasets) &&
    (datasetInput && nodeInputIsReference(datasetInput)
      ? datasets.length > 0
      : datasets.some((dataset) => dataset?.datasetId));
  const fileInput = inputMap.get(NodeInputKeyEnum.fileUrlList);
  const canUploadFile = fileInput
    ? getSelectedInputRenderType(fileInput) === FlowNodeInputTypeEnum.agentGenerated ||
      Boolean(fileInput.value?.length)
    : true;
  const skillManager = useSkillManager({
    selectedTools,
    selectedAgentSkills,
    onUpdateOrAddTool,
    onAddAgentSkill: skillSelection.onAddAgentSkill,
    onEnableSandbox: () => skillSelection.onChangeAgentSandbox(true),
    canUploadFile,
    hasSelectedDataset,
    useAgentSandbox,
    currentAppId: appDetail._id,
    onClickDatasetSearch: () => {
      const attribute = hasSelectedDataset
        ? 'data-dataset-params-trigger'
        : 'data-dataset-select-trigger';
      document.querySelector<HTMLElement>(`[${attribute}="${nodeId}"]`)?.click();
    }
  });
  const editorVariables = useMemoEnhance(
    () => getEditorVariables({ nodeId, getNodeById, edges, appDetail, t }),
    [nodeId, getNodeById, edges, appDetail, t]
  );
  const allVariables = useMemo(
    () => [
      ...editorVariables,
      ...(feConfigs.externalProviderWorkflowVariables?.map((item) => ({
        key: item.key,
        label: item.name
      })) ?? [])
    ],
    [editorVariables, feConfigs.externalProviderWorkflowVariables]
  );
  const onPromptChange = useCallback(
    (value: string) => {
      updateInputs({ [NodeInputKeyEnum.aiSystemPrompt]: value });
    },
    [updateInputs]
  );

  return {
    selectedTools,
    selectedAgentSkills,
    canUploadFile,
    onUpdateOrAddTool,
    onDeleteTool,
    skillSelection,
    skillManager,
    editorVariables,
    allVariables,
    onPromptChange
  };
};

const AgentNodeInputContext = createContext<ReturnType<typeof useAgentNodeInputs> | undefined>(
  undefined
);

/** Agent 专属模板只能在对应节点的 Provider 内使用，避免静默渲染空配置。 */
export const useAgentNodeInputContext = () => {
  const context = useContext(AgentNodeInputContext);
  if (!context) throw new Error('Agent input requires AgentNodeInputProvider');
  return context;
};

/** 向模板渲染器提供 Agent 上下文，并统一挂载配置/套餐提示弹窗。 */
export const AgentNodeInputProvider = ({
  data,
  children
}: {
  data: FlowNodeItemType;
  children: React.ReactNode;
}) => {
  const context = useAgentNodeInputs(data);
  const { ConfirmModal, isOpenRecharge, onCloseRecharge } = context.skillSelection;
  return (
    <AgentNodeInputContext.Provider value={context}>
      {children}
      <ConfirmModal />
      {isOpenRecharge && <RechargeModal onClose={onCloseRecharge} onPaySuccess={onCloseRecharge} />}
      {context.skillManager.toolConfigModal}
    </AgentNodeInputContext.Provider>
  );
};
