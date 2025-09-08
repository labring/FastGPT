import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SubAppIds } from '../../agent/constants';

export const PlanAgentTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.plan,
    description:
      '如果用户的任务非常复杂，可以先使用 plan_agent 制定计划，然后根据计划使用其他工具来完成任务。同时，plan_agent 负责维护整个任务的上下文和状态。可以更新或修改计划中的内容. 但是 plan_agent 不能直接执行任务。',
    parameters: {
      type: 'object',
      properties: {
        instruction: {
          type: 'string',
          description:
            '给 plan_agent 的指令, 例如: "制定一个包含以下步骤的计划:xxx", "将 xxx 待办事项标记为已完成"'
        }
      },
      required: ['instruction']
    }
  }
};
