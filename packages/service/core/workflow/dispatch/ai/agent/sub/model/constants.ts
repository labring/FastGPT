import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SubAppIds } from '../constants';

export const ModelAgentTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.model,
    description: '调用 LLM 模型完成一些通用任务。',
    parameters: {
      type: 'object',
      properties: {
        systemPrompt: {
          type: 'string',
          description: '系统提示词，用于为 LLM 提供完成任务的引导。'
        },
        task: {
          type: 'string',
          description: '本轮需要完成的任务'
        }
      },
      required: ['task']
    }
  }
};
