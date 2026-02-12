import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SubAppIds, systemSubInfo } from '@fastgpt/global/core/workflow/node/agent/constants';
import type { InteractiveNodeResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import z from 'zod';

export const PlanCheckInteractive: InteractiveNodeResponseType = {
  type: 'agentPlanCheck',
  params: {
    confirmed: false
  }
};

export const PlanAgentParamsSchema = z.object({
  task: z.string(),
  description: z.string(),
  background: z.string().nullish()
});
export type PlanAgentParamsType = z.infer<typeof PlanAgentParamsSchema>;
export const PlanAgentTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.plan,
    description: systemSubInfo[SubAppIds.plan].toolDescription,
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: '对需要规划的任务的简要描述'
        },
        description: {
          type: 'string',
          description: '对需要规划的任务的详细描述'
        },
        background: {
          type: 'string',
          description:
            '辅助完成规划的背景信息，需要尽可能详细，需要总结当前上下文中关于步骤执行和历史回复的信息'
        }
      },
      required: ['task', 'description']
    }
  }
};
