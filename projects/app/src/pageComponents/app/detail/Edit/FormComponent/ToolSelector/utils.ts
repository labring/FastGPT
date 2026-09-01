import {
  canInputBeAgentGenerated,
  getSavedToolInputSelectedType,
  initToolInputTypeByDefaultMode,
  isAgentGeneratedToolInput,
  migrateToolInputConfig,
  stripToolInputDefaultMode
} from '@fastgpt/global/core/app/formEdit/utils';
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
        allowUserChatInputAgentGenerated: true
      });
      const normalizedInput = initToolInputTypeByDefaultMode(input, {
        forceDefaultMode: selectedType === undefined,
        allowUserChatInputAgentGenerated: true
      });
      if (!sourceInput) return stripToolInputDefaultMode(normalizedInput);

      return stripToolInputDefaultMode(
        migrateToolInputConfig({
          input: normalizedInput,
          sourceInput
        })
      );
    })
  } as T;
};
