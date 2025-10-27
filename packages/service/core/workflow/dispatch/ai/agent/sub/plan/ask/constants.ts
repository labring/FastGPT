import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SubAppIds } from '../../constants';

export type AskAgentToolParamsType = {
  questions: string[];
};

export const PlanAgentAskTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.ask,
    description: `信息澄清助手
        本工具用于从用户处收集必要的细节，以便有效完成任务。 当用户输入缺少关键信息、表达意图模糊或存在多种解释时调用。本工具应提出简洁、自然且尊重的澄清问题，避免冗余。`,
    parameters: {
      type: 'object',
      properties: {
        questions: {
          description: `要向用户搜集的问题列表`,
          items: {
            type: 'string',
            description: '一个具体的、有针对性的问题'
          },
          type: 'array',
          minItems: 1,
          maxItems: 10
        }
      },
      required: ['questions']
    }
  }
};
