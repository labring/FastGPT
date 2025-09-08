import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SubAppIds } from '../constants';

export const StopAgentTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.stop,
    description: '如果完成了所有的任务，可调用此工具。'
  }
};
