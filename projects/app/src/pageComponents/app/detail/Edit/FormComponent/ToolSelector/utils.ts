import {
  canInputBeAgentGenerated,
  isAgentGeneratedToolInput
} from '@fastgpt/global/core/app/formEdit/utils';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';

export const countAgentGeneratedToolInputs = (tool: Pick<FlowNodeTemplateType, 'inputs'>) =>
  tool.inputs.filter((input) => isAgentGeneratedToolInput(input) && canInputBeAgentGenerated(input))
    .length;

export const inheritToolInputConfig = <T extends Pick<FlowNodeTemplateType, 'inputs'>>({
  tool,
  sourceTool
}: {
  tool: T;
  sourceTool?: Pick<FlowNodeTemplateType, 'inputs'>;
}): T => {
  if (!sourceTool) return tool;

  const sourceInputMap = new Map(sourceTool.inputs.map((input) => [input.key, input]));

  return {
    ...tool,
    inputs: tool.inputs.map((input) => {
      const sourceInput = sourceInputMap.get(input.key);
      if (!sourceInput) return input;

      return {
        ...input,
        value: sourceInput.value,
        valueDesc: sourceInput.valueDesc,
        renderTypeList: sourceInput.renderTypeList,
        selectedType: sourceInput.selectedType,
        selectedTypeIndex: sourceInput.selectedTypeIndex,
        isToolParam: sourceInput.isToolParam,
        toolDescription: sourceInput.toolDescription
      } satisfies FlowNodeInputItemType;
    })
  } as T;
};
