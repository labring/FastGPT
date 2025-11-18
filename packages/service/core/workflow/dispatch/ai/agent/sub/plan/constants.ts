import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SubAppIds, systemSubInfo } from '../constants';
import type { InteractiveNodeResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';

export const PlanCheckInteractive: InteractiveNodeResponseType = {
  type: 'agentPlanCheck',
  params: {
    confirmed: false
  }
};
export const PlanAgentTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.plan,
    description: systemSubInfo[SubAppIds.plan].toolDescription,
    parameters: {}
  }
};
