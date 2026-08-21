import { useCallback, useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import { useSkillManager } from '@/pageComponents/app/detail/Edit/ChatAgent/hooks/useSkillManager';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import { getToolIdentityKey } from '@fastgpt/global/core/app/tool/utils';

/**
 * Adapts the ChatAgent's useSkillManager to work in the workflow node context.
 * Reads/writes selectedTools from/to the node's input via onChangeNode.
 */
export const useAgentSkillManager = ({
  nodeId,
  inputs,
  onClickDatasetSearch
}: {
  nodeId: string;
  inputs: FlowNodeInputItemType[];
  onClickDatasetSearch?: () => void;
}) => {
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const toolsInput = useMemo(
    () => inputs.find((i) => i.key === NodeInputKeyEnum.selectedTools),
    [inputs]
  );
  const selectedTools: SelectedToolItemType[] = useMemo(
    () => (Array.isArray(toolsInput?.value) ? toolsInput!.value : []),
    [toolsInput]
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
      const toolKey = getToolIdentityKey(tool.pluginId, tool.source);
      const exists = selectedTools.find(
        (t) => getToolIdentityKey(t.pluginId, t.source) === toolKey
      );
      const newTools = exists
        ? selectedTools.map((t) =>
            getToolIdentityKey(t.pluginId, t.source) === toolKey ? tool : t
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
        (t) => getToolIdentityKey(t.pluginId, t.source) !== toolKey
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

  const { skillOption, selectedSkills, onClickSkill, onRemoveSkill, SkillModal } = useSkillManager({
    selectedTools,
    onUpdateOrAddTool,
    onDeleteTool,
    canUploadFile,
    hasSelectedDataset,
    useAgentSandbox,
    onClickDatasetSearch
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
