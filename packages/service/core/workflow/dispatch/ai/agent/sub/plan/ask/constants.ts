import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SubAppIds } from '../../constants';
import z from 'zod';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

/* AI 表单输出 schema */
const InputSchema = z.object({
  type: z.enum([FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.numberInput]),
  label: z.string()
});
const SelectSchema = z.object({
  type: z.enum([FlowNodeInputTypeEnum.select, FlowNodeInputTypeEnum.multipleSelect]),
  label: z.string(),
  options: z.array(z.string())
});
export const AIAskAnswerSchema = z.object({
  question: z.string(),
  form: z.array(z.union([InputSchema, SelectSchema])).optional()
});
export type AIAskAnswerType = z.infer<typeof AIAskAnswerSchema>;

export const AIAskTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.ask,
    description: `工具描述：交互式信息澄清助手 (Proactive Clarification Tool)
本工具专用于与用户进行对话式交互，主动澄清模糊需求，收集完成任务所需的关键信息。 核心目标是**引导用户提供更具体、更明确的指令**。
**触发条件 (Activation Triggers):**
*   用户输入信息不完整，缺少必要细节。
*   用户表达意图模糊，存在多种可能性。
*   需要用户提供主观偏好或个性化设置。
**交互策略 (Interaction Strategy):**
*   **主动询问 (Proactive Inquiry):**  根据用户输入，**推断**缺失的信息，并直接提问。
*   **避免重复 (No Repetition):**  **不要**重复用户的问题，而是针对问题中的**不确定性**进行提问。
*   **简洁明了 (Concise & Clear):**  使用简短、自然的语言，避免术语和复杂句式。
*   **目标导向 (Goal-Oriented):**  提问应围绕完成任务所需的**最关键信息**展开。
**示例 (Examples):**
*   用户：“我想出去旅游。”
*   工具：“您希望前往哪个**目的地**？大致的**出行日期**是什么时候？有几位**同行者**？” (直接询问缺失的关键信息)
*   用户：“我想知道 Qwen 的全家桶有什么东西。”
*   工具：“您对 Qwen 的哪些**具体产品类型**感兴趣？例如，是想了解模型、API 还是应用？” (避免重复问题，而是 уточнить его запрос)
**禁止行为 (Prohibited Behaviors):**
*   **禁止**直接重复用户的问题。
*   **禁止**一次性提出过多问题，保持对话的流畅性。
*   **禁止**询问与任务无关的信息。
**最终目标 (Final Goal):** 通过高效的对话，获取足够的信息，使后续工具能够顺利完成任务。`,
    parameters: {
      type: 'object',
      properties: {
        question: {
          description: `向用户提问的问题/表单描述`,
          type: 'string'
        },
        form: {
          description: `需要收集信息的表单，如果需要复杂的信息收集，则使用这个字段`,
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                description: `问题类型，可选值为：
                    input: 文本输入框
                    numberInput: 数字输入框
                    select: 单选
                    multipleSelect: 多选`,
                type: 'string',
                enum: ['input', 'numberInput', 'select', 'multipleSelect']
              },
              label: {
                description: `问题名称`,
                type: 'string'
              },
              options: {
                description: `选项列表，当 type 为 select 或 multipleSelect 时必填`,
                type: 'array',
                items: {
                  type: 'string',
                  description: '选项文本'
                }
              }
            }
          },
          required: ['type', 'label']
        }
      },
      required: ['question']
    }
  }
};
