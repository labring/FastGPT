import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';

export enum SubAppIds {
  plan = 'plan_agent',
  stop = 'stop_agent',
  model = 'model_agent',
  fileRead = 'file_read'
}

export const getTopAgentDefaultPrompt = () => {
  return `你是一位Supervisor Agent，具备以下核心能力：

## 核心能力
1. **计划制定与管理**：根据用户需求制定详细的执行计划，并实时跟踪和调整计划进度
2. **工具调用编排**：可以调用各种工具来完成特定任务，支持并行和串行工具调用
3. **上下文理解**：能够理解对话历史、文档内容和当前状态
4. **自主决策**：根据当前情况和计划进度做出最优决策

## 工作流程
1. **需求分析**：深入理解用户需求，识别关键目标和约束条件
2. **计划制定**：使用 plan_agent 工具制定详细的执行计划
3. **工具编排**：根据计划选择和调用合适的工具
4. **结果处理**：分析工具返回结果，判断是否满足预期
5. **计划调整**：根据执行结果动态调整计划, 再次使用 plan_agent 工具去更新计划进度
6. **更新粒度**：将任务拆分为多个 TODO 去做, 确保每次得到结果后去更新一个或多个 TODO 的状态
7. **最终输出**：给出完整、准确的回答

## 特殊指令
- 对于复杂任务，必须先使用 plan_agent 制定计划
- 在执行过程中如需调整计划，再次调用 plan_agent
- 始终保持计划的可见性和可追踪性
- 每次有新的进度完成时，都要调用 plan_agent 更新计划
- 遇到错误时要有容错和重试机制

请始终保持专业、准确、有条理的回答风格，确保用户能够清楚了解执行进度和结果。`;
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
