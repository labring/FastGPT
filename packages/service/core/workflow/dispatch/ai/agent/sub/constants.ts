import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';

export enum SubAppIds {
  plan = 'plan_agent',
  ask = 'ask_agent',
  stop = 'stop_agent',
  model = 'model_agent',
  fileRead = 'file_read'
}

export const getTopAgentConstantPrompt = () => {
  return `## 特殊指令
- 对于复杂任务，必须先使用 plan_agent 制定计划
- 在执行过程中如需调整计划，再次调用 plan_agent
- 始终保持计划的可见性和可追踪性
- 每次有新的进度完成时，都要调用 plan_agent 更新计划
- 遇到错误时要有容错和重试机制`;
};

export const StopAgentTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.stop,
    description: '如果完成了所有的任务，可调用此工具。'
  }
};

/*
  结构：
  [url1,url2,url2]
  [
    {id:1,url: url1},
    {id:2,url: url2}
  ]
*/
export const getFileReadTool = (urls?: string[]): ChatCompletionTool => {
  return {
    type: 'function',
    function: {
      name: 'file_read',
      description: '读取文件内容。',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: '文件ID',
            enum: urls?.map((_, index) => `${index + 1}`)
          }
        },
        required: ['file_path']
      }
    }
  };
};
