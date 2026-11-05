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
import { useNodeActions } from '@/web/core/workflow/editor/react/useNode';
import { useFieldActions } from '@/web/core/workflow/editor/react/useField';
import { useNodeWorkflowDocument } from '../render/useWorkflowDocument';
import { getEditorVariables } from '../../../utils';

/** 仅适配 Agent 节点的输入更新、提示词资源和共享选择逻辑，不维护另一套表单渲染。 */
const useAgentNodeInputs = ({ nodeId, inputs }: FlowNodeItemType) => {
  const { t } = useTranslation();
  const nodeActions = useNodeActions(nodeId);
  const promptField = useFieldActions({
    nodeId,
    fieldKey: NodeInputKeyEnum.aiSystemPrompt,
    kind: 'input'
  });
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus } = useUserStore();
  const { workflow, getNodeById, graph } = useNodeWorkflowDocument({ nodeId });
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

  /** 字段值写入当前 Runtime 记录；技能与沙盒联动时使用同一节点事务。 */
  const updateInputFields = useCallback(
    (values: Record<string, unknown>) => {
      nodeActions?.updateNode((current) => ({
        inputs: current.inputs.map((input) =>
          Object.prototype.hasOwnProperty.call(values, input.key)
            ? { ...input, value: values[input.key] }
            : input
        )
      }));
    },
    [nodeActions]
  );
  const onUpdateSkills = useCallback(
    (
      update: (skills: SelectedAgentSkillItemType[]) => SelectedAgentSkillItemType[],
      enableSandbox?: boolean
    ) => {
      nodeActions?.updateNode((current) => ({
        inputs: current.inputs.map((input) => {
          if (input.key === NodeInputKeyEnum.skills) {
            const skills = Array.isArray(input.value) ? input.value : [];
            return { ...input, value: update(skills) };
          }
          if (input.key === NodeInputKeyEnum.useAgentSandbox && enableSandbox) {
            return { ...input, value: true };
          }
          return input;
        })
      }));
    },
    [nodeActions]
  );
  const onUpdateSandbox = useCallback(
    (checked: boolean) => {
      updateInputFields({ [NodeInputKeyEnum.useAgentSandbox]: checked });
    },
    [updateInputFields]
  );
  const skillSelection = useAgentSkillSelect({
    selectedAgentSkills,
    useAgentSandbox,
    showSandbox: feConfigs.show_agent_sandbox,
    enableSandbox: !teamPlanStatus?.standard || !!teamPlanStatus.standard.enableSandbox,
    onUpdateSkills,
    onUpdateSandbox
  });

  /** 工具预览可能异步返回；写入时从 Runtime 的最新节点读取，避免覆盖期间编辑。 */
  const updateTools = useCallback(
    (update: (tools: SelectedToolItemType[]) => SelectedToolItemType[]) => {
      nodeActions?.updateNode((current) => ({
        inputs: current.inputs.map((input) => {
          if (input.key !== NodeInputKeyEnum.selectedTools) return input;
          const tools = Array.isArray(input.value) ? input.value : [];
          return { ...input, value: update(tools) };
        })
      }));
    },
    [nodeActions]
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
    currentAppId: appId || undefined,
    onClickDatasetSearch: () => {
      const attribute = hasSelectedDataset
        ? 'data-dataset-params-trigger'
        : 'data-dataset-select-trigger';
      document.querySelector<HTMLElement>(`[${attribute}="${nodeId}"]`)?.click();
    }
  });
  const editorVariables = useMemoEnhance(() => {
    if (!workflow || !graph) return [];
    return getEditorVariables({
      nodeId,
      getNodeById,
      chatConfig: workflow.chatConfig,
      t,
      getSourceNodeIds: (sourceNodeId) => graph.getSourceNodeIds({ nodeId: sourceNodeId })
    });
  }, [nodeId, workflow, getNodeById, graph, t]);
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
      promptField.setValue(value);
    },
    [promptField]
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
      {isOpenRecharge && (
        <RechargeModal
          onClose={onCloseRecharge}
          onPaySuccess={() => {
            onCloseRecharge();
          }}
        />
      )}
      {context.skillManager.toolConfigModal}
    </AgentNodeInputContext.Provider>
  );
};
