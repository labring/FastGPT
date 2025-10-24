import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SubAppIds } from '../../constants';

export type AskAgentToolParamsType = {
  questions: string[];
};

export const PlanAgentAskTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.ask,
    description: `当缺少制定计划所必需的前置信息时调用此工具。使用场景：
1. 用户问题不明确，需要澄清具体目标或需求
2. 缺少关键的用户偏好信息（如技术水平、预算、时间等）
3. 需要了解用户的具体场景或约束条件
4. 任何影响计划制定的关键信息缺失

调用此工具会暂停计划生成，先向用户收集信息后再继续。`,
    parameters: {
      type: 'object',
      properties: {
        questions: {
          description: `要向用户提出的问题列表。每个问题应该：
- 具体明确，针对缺失的关键信息
- 有助于制定更准确的计划
- 避免过于宽泛或模糊的问题
示例：["您想学习什么主题？", "您的当前水平如何（初级/中级/高级）？", "您每天可以投入多长时间学习？"]`,
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
