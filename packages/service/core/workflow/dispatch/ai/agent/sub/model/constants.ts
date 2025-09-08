import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SubAppIds } from '../constants';

export const ModelAgentTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.model,
    description: '完成一些简单通用型任务, 可以调用此工具。',
    parameters: {
      type: 'object',
      properties: {
        systemPrompt: {
          type: 'string',
          description: '注入给此 agent 的系统提示词'
        },
        task: {
          type: 'string',
          description: '此 agent 本轮需要完成的任务'
        }
      },
      required: ['systemPrompt', 'task']
    }
  }
};
