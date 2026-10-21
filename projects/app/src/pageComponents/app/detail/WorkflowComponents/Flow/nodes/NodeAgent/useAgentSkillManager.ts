import { useCallback, useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import { useSkillManager } from '@/pageComponents/app/detail/Edit/ChatAgent/hooks/useSkillManager';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type {
  SelectedAgentSkillItemType,
  SelectedToolItemType
} from '@fastgpt/global/core/app/formEdit/type';
import { getToolIdentityKey } from '@fastgpt/global/core/app/tool/utils';
import { useLatest } from 'ahooks';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { AGENT_SANDBOX_TOOLSET_ID } from '@fastgpt/global/core/ai/sandbox/tools';
import type { SkillOptionItemType } from '@fastgpt/web/components/common/Textarea/PromptEditor/plugins/SkillPickerPlugin';
import { buildAgentSkillInputUpdates } from './utils';

/**
 * Adapts the ChatAgent's useSkillManager to work in the workflow node context.
 * Reads/writes selectedTools and skills from/to the node's input via onChangeNode.
 */
export const useAgentSkillManager = ({
  nodeId,
  inputs,
  onClickDatasetSearch,
  checkSkillSandboxAvailable,
  onChangeAgentSandbox
}: {
  nodeId: string;
  inputs: FlowNodeInputItemType[];
  onClickDatasetSearch?: () => void;
  /** 技能运行依赖虚拟机；返回 false 时由调用方负责提示，此处中止写入。 */
  checkSkillSandboxAvailable?: () => boolean;
  /** 与 Agent V2 一致：@ 选择虚拟机工具集时联动节点上的虚拟机开关。 */
  onChangeAgentSandbox?: (checked: boolean) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const toolsInput = useMemo(
    () => inputs.find((i) => i.key === NodeInputKeyEnum.selectedTools),
    [inputs]
  );
  const selectedTools: SelectedToolItemType[] = useMemo(
    () => (Array.isArray(toolsInput?.value) ? toolsInput!.value : []),
    [toolsInput]
  );

  const skillsInput = useMemo(
    () => inputs.find((i) => i.key === NodeInputKeyEnum.skills),
    [inputs]
  );
  const sandboxInput = useMemo(
    () => inputs.find((i) => i.key === NodeInputKeyEnum.useAgentSandbox),
    [inputs]
  );
  const selectedAgentSkills: SelectedAgentSkillItemType[] = useMemo(
    () => (Array.isArray(skillsInput?.value) ? skillsInput!.value : []),
    [skillsInput]
  );
  const useAgentSandbox = !!sandboxInput?.value;

  // Picker 内回调可能持有旧闭包，写入前统一读取最新的节点输入。
  const latestSkillsInput = useLatest(skillsInput);
  const latestSandboxInput = useLatest(sandboxInput);
  const latestSelectedAgentSkills = useLatest(selectedAgentSkills);

  const fileLinkInput = useMemo(
    () => inputs.find((i) => i.key === NodeInputKeyEnum.fileUrlList),
    [inputs]
  );
  // 文件输入存在即具备文件解析能力，不要求当前已经上传文件。
  const canUploadFile = !!fileLinkInput;

  const datasetInput = useMemo(
    () => inputs.find((i) => i.key === NodeInputKeyEnum.datasetSelectList),
    [inputs]
  );
  const hasSelectedDataset = Array.isArray(datasetInput?.value) && datasetInput!.value.length > 0;

  const onUpdateOrAddTool = useCallback(
    (tool: SelectedToolItemType) => {
      const toolId = tool.pluginId ?? tool.id;
      const toolKey = getToolIdentityKey(toolId, tool.source);
      const exists = selectedTools.find(
        (t) => getToolIdentityKey(t.pluginId ?? t.id, t.source) === toolKey
      );
      const newTools = exists
        ? selectedTools.map((t) =>
            getToolIdentityKey(t.pluginId ?? t.id, t.source) === toolKey ? tool : t
          )
        : [...selectedTools, tool];

      if (toolsInput) {
        onChangeNode({
          nodeId,
          key: NodeInputKeyEnum.selectedTools,
          type: 'updateInput',
          value: {
            ...toolsInput,
            value: newTools
          }
        });
      }
    },
    [selectedTools, toolsInput, nodeId, onChangeNode]
  );

  const onDeleteTool = useCallback(
    (id: string, source?: string) => {
      const toolKey = getToolIdentityKey(id, source);
      const newTools = selectedTools.filter(
        (t) => getToolIdentityKey(t.pluginId ?? t.id, t.source) !== toolKey
      );
      if (toolsInput) {
        onChangeNode({
          nodeId,
          key: NodeInputKeyEnum.selectedTools,
          type: 'updateInput',
          value: {
            ...toolsInput,
            value: newTools
          }
        });
      }
    },
    [selectedTools, toolsInput, nodeId, onChangeNode]
  );

  /**
   * 新增关联技能：校验虚拟机可用性后，一次性写回 skills 与虚拟机开关。
   * 返回 false 时 useSkillManager 会中止向提示词插入技能。
   */
  const onAddAgentSkill = useCallback(
    (skill: SelectedAgentSkillItemType) => {
      const currentSkillsInput = latestSkillsInput.current;
      if (!currentSkillsInput) return false;
      if (checkSkillSandboxAvailable && !checkSkillSandboxAvailable()) return false;

      const { updates, sandboxAutoEnabled } = buildAgentSkillInputUpdates({
        nodeId,
        skillsInput: currentSkillsInput,
        sandboxInput: latestSandboxInput.current ?? undefined,
        selectedAgentSkills: latestSelectedAgentSkills.current ?? [],
        skill
      });
      onChangeNode(updates);

      if (sandboxAutoEnabled) {
        toast({
          status: 'success',
          title: t('skill:sandbox_auto_enabled_for_skill')
        });
      }

      return true;
    },
    [
      checkSkillSandboxAvailable,
      latestSandboxInput,
      latestSelectedAgentSkills,
      latestSkillsInput,
      nodeId,
      onChangeNode,
      t,
      toast
    ]
  );

  const onRemoveAgentSkill = useCallback(
    (skillId: string) => {
      const currentSkillsInput = latestSkillsInput.current;
      if (!currentSkillsInput) return;

      onChangeNode({
        nodeId,
        key: NodeInputKeyEnum.skills,
        type: 'updateInput',
        value: {
          ...currentSkillsInput,
          value: (latestSelectedAgentSkills.current ?? []).filter(
            (item) => item.skillId !== skillId
          )
        }
      });
    },
    [latestSelectedAgentSkills, latestSkillsInput, nodeId, onChangeNode]
  );

  const { skillOption, selectedSkills, onClickSkill, onRemoveSkill, SkillModal } = useSkillManager({
    selectedTools,
    selectedAgentSkills,
    onAddAgentSkill: skillsInput ? onAddAgentSkill : undefined,
    onUpdateOrAddTool,
    onDeleteTool,
    canUploadFile,
    hasSelectedDataset,
    useAgentSandbox,
    onClickDatasetSearch
  });

  /**
   * 与 Agent V2 保持一致：通过 @ 选中虚拟机工具集时同步打开虚拟机开关。
   * 依赖保持稳定，避免提示词输入触发 @ 菜单列状态重置。
   */
  const promptSkillOption = useMemo<SkillOptionItemType>(() => {
    const onSelect = skillOption.onSelect;
    if (!onSelect) return skillOption;

    return {
      ...skillOption,
      onSelect: async (id: string) => {
        const option = await onSelect(id);
        if (!option?.onClick) return option;

        const onClick = option.onClick;
        return {
          ...option,
          onClick: async (toolId: string, source?: string) => {
            const result = await onClick(toolId, source);
            if (result?.id === AGENT_SANDBOX_TOOLSET_ID && !useAgentSandbox) {
              onChangeAgentSandbox?.(true);
            }
            return result;
          }
        };
      }
    };
  }, [skillOption, useAgentSandbox, onChangeAgentSandbox]);

  return {
    selectedTools,
    skillOption: promptSkillOption,
    selectedSkills,
    selectedAgentSkills,
    canUploadFile,
    onClickSkill,
    onRemoveSkill,
    onUpdateOrAddTool,
    onDeleteTool,
    onAddAgentSkill,
    onRemoveAgentSkill,
    SkillModal
  };
};
