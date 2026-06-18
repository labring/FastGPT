import {
  canInputBeAgentGenerated,
  isAgentGeneratedToolInput
} from '@fastgpt/global/core/app/formEdit/utils';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';

export const countAgentGeneratedToolInputs = (tool: Pick<FlowNodeTemplateType, 'inputs'>) =>
  tool.inputs.filter((input) => isAgentGeneratedToolInput(input) && canInputBeAgentGenerated(input))
    .length;
