import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SubAppIds } from '../../constants';

export type AskAgentToolParamsType = {
  questions: string[];
};

export const PlanAgentAskTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.ask,
    description: `在涉及用户个人偏好、具体场景细节或需要用户确认的重要决策点、流程实在进行不下去的情况下时，使用该工具来向用户搜集信息`,
    parameters: {
      type: 'object',
      properties: {
        questions: {
          description: '要向用户确认的问题列表',
          items: { type: 'string' },
          type: 'array'
        }
      },
      required: ['questions']
    }
  }
};
