import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SubAppIds } from '../constants';

export const PlanAgentTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.plan,
    description: '分析和拆解用户问题，制定分步计划。',
    parameters: {}
  }
};
