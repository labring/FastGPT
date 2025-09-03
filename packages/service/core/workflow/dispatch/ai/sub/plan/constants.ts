import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SubAppIds } from '../../agent/constants';

export const PlanAgentTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.plan,
    description:
      '如果用户的任务非常复杂，可以先使用 plan_agent 制定计划，然后根据计划使用其他工具来完成任务。同时，plan_agent 负责维护整个任务的上下文和状态。可以更新或修改计划中的内容',
    parameters: {
      type: 'object',
      properties: {
        instruction: {
          type: 'string',
          description: ''
        }
      },
      required: ['instruction']
    }
  }
};
