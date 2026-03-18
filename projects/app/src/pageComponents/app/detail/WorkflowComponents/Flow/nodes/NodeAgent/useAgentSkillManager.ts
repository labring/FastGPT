import { useCallback, useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import { useSkillManager } from '@/pageComponents/app/detail/Edit/ChatAgent/hooks/useSkillManager';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';

/**
 * Adapts the ChatAgent's useSkillManager to work in the workflow node context.
 * Reads/writes selectedTools from/to the node's input via onChangeNode.
 */
export const useAgentSkillManager = ({
  nodeId,
  inputs
}: {
  nodeId: string;
  inputs: FlowNodeInputItemType[];
}) => {
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const toolsInput = useMemo(
    () => inputs.find((i) => i.key === NodeInputKeyEnum.selectedTools),
    [inputs]
  );
  const selectedTools: SelectedToolItemType[] = useMemo(
    () => (Array.isArray(toolsInput?.value) ? toolsInput!.value : []),
    [toolsInput?.value]
  );

  const fileLinkInput = useMemo(() => inputs.find((i) => i.key === 'fileLink'), [inputs]);
  const canUploadFile = !!fileLinkInput?.value;

  const datasetInput = useMemo(
    () => inputs.find((i) => i.key === NodeInputKeyEnum.datasetSelectList),
    [inputs]
  );
  const hasSelectedDataset = Array.isArray(datasetInput?.value) && datasetInput!.value.length > 0;

  const useAgentSandbox = useMemo(() => {
    const sandboxInput = inputs.find((i) => i.key === NodeInputKeyEnum.useAgentSandbox);
    return !!sandboxInput?.value;
  }, [inputs]);

  const onUpdateOrAddTool = useCallback(
    (tool: SelectedToolItemType) => {
      const exists = selectedTools.find((t) => t.pluginId === tool.pluginId);
      const newTools = exists
        ? selectedTools.map((t) => (t.pluginId === tool.pluginId ? tool : t))
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
    (id: string) => {
      const newTools = selectedTools.filter((t) => t.pluginId !== id);
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

  const { skillOption, selectedSkills, onClickSkill, onRemoveSkill, SkillModal } = useSkillManager({
    selectedTools,
    onUpdateOrAddTool,
    onDeleteTool,
    canUploadFile,
    hasSelectedDataset,
    useAgentSandbox
  });

  return {
    selectedTools,
    skillOption,
    selectedSkills,
    onClickSkill,
    onRemoveSkill,
    onUpdateOrAddTool,
    onDeleteTool,
    SkillModal
  };
};
