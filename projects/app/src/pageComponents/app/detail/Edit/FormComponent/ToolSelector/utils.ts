import {
  canInputBeAgentGenerated,
  getSavedToolInputSelectedType,
  initToolInputTypeByDefaultMode,
  isAgentGeneratedToolInput,
  stripToolInputDefaultMode
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
  const sourceInputMap = new Map(sourceTool?.inputs.map((input) => [input.key, input]));

  return {
    ...tool,
    inputs: tool.inputs.map((input) => {
      const sourceInput = sourceInputMap.get(input.key);
      const selectedType = getSavedToolInputSelectedType({
        savedInput: sourceInput,
        defaultInput: input,
        allowUserChatInputAgentGenerated: true,
        allowLegacyToolDescriptionFallback: true
      });
      const normalizedInput = initToolInputTypeByDefaultMode(input, {
        forceDefaultMode: selectedType === undefined,
        allowUserChatInputAgentGenerated: true
      });
      if (!sourceInput) return stripToolInputDefaultMode(normalizedInput);

      const renderTypeList =
        selectedType && !normalizedInput.renderTypeList.includes(selectedType)
          ? [selectedType, ...normalizedInput.renderTypeList]
          : normalizedInput.renderTypeList;
      const selectedTypeIndex =
        selectedType !== undefined
          ? renderTypeList.findIndex((item) => item === selectedType)
          : normalizedInput.selectedTypeIndex;

      return stripToolInputDefaultMode({
        ...normalizedInput,
        value: sourceInput.value,
        valueDesc: sourceInput.valueDesc,
        renderTypeList,
        selectedType: selectedType ?? normalizedInput.selectedType,
        selectedTypeIndex:
          selectedTypeIndex !== undefined && selectedTypeIndex >= 0 ? selectedTypeIndex : undefined,
        toolDescription: input.toolDescription ?? sourceInput.toolDescription
      } satisfies FlowNodeInputItemType);
    })
  } as T;
};
