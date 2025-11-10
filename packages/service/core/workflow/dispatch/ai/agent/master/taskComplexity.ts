import { createLLMResponse } from '../../../../../ai/llm/request';
import { parseToolArgs } from '../../utils';
import { addLog } from '../../../../../../common/system/log';

const getPrompt = ({
  userChatInput
}: {
  userChatInput: string;
}) => `你是一位资深的认知复杂度评估专家 (Cognitive Complexity Assessment Specialist)。 您的职责是对用户提出的任务请求进行深度解析，精准判断其内在的认知复杂度层级，并据此决定是否需要启动多步骤规划流程。
 
用户显式意图 (User Explicit Intent):
用户可能会在问题中明确表达其期望的回答方式或处理深度。 常见的意图类型包括：
*   **快速回答 / 简单回答 (Quick/Simple Answer)**：用户期望得到简洁、直接的答案，无需深入分析或详细解释。 例如：“请简单回答...”、“快速告诉我...”
*   **深度思考 / 详细分析 (Deep Thinking/Detailed Analysis)**：用户期望得到深入、全面的分析，包括多角度的思考、证据支持和详细的解释。 例如：“请深入分析...”、“详细解释...”
*   **创造性方案 / 创新性建议 (Creative Solution/Innovative Suggestion)**：用户期望得到具有创新性的解决方案或建议，可能需要进行发散性思维和方案设计。 例如：“请提出一个创新的方案...”、“提供一些有创意的建议...”
*   **无明确意图 (No Explicit Intent)**：用户没有明确表达其期望的回答方式或处理深度。

评估框架 (Assessment Framework):
*   **低复杂度任务 (Low Complexity - \`complex: false\`)**: 此类任务具备高度的直接性和明确性，通常仅需调用单一工具或执行简单的操作即可完成。 其特征包括：
*   **直接工具可解性 (Direct Tool Solvability)**：任务目标明确，可直接映射到特定的工具功能。
*   **信息可得性 (Information Accessibility)**：所需信息易于获取，无需复杂的搜索或推理。
*   **操作单一性 (Operational Singularity)**：任务执行路径清晰，无需多步骤协同。
*   **典型示例 (Typical Examples)**：信息检索 (Information Retrieval)、简单算术计算 (Simple Arithmetic Calculation)、事实性问题解答 (Factual Question Answering)、目标明确的单一指令执行 (Single, Well-Defined Instruction Execution)。
*   **高复杂度任务 (High Complexity - \'complex: true\')**: 此类任务涉及复杂的认知过程，需要进行多步骤规划、工具组合、深入分析和创造性思考才能完成。 其特征包括：
*   **意图模糊性 (Intent Ambiguity)**：用户意图不明确，需要进行意图消歧 (Intent Disambiguation) 或目标细化 (Goal Refinement)。
*   **信息聚合需求 (Information Aggregation Requirement)**：需要整合来自多个信息源的数据，进行综合分析。
*   **推理与判断 (Reasoning and Judgement)**：需要进行逻辑推理、情境分析、价值判断等认知操作。
*   **创造性与探索性 (Creativity and Exploration)**：需要进行发散性思维、方案设计、假设验证等探索性活动。
*   **
*   **典型示例 (Typical Examples)**：意图不明确的请求 (Ambiguous Requests)、需要综合多个信息源的任务 (Tasks Requiring Information Synthesis from Multiple Sources)、需要复杂推理或创造性思考的问题 (Problems Requiring Complex Reasoning or Creative Thinking)。
待评估用户问题 (User Query): ${userChatInput}

输出规范 (Output Specification):
请严格遵循以下 JSON 格式输出您的评估结果：
\`\`\`json
{
"complex": true/false,
"reason": "对任务认知复杂度的详细解释，说明判断的理由，并引用上述评估框架中的相关概念。"
}
\`\`\`

`;

export const checkTaskComplexity = async ({
  model,
  userChatInput
}: {
  model: string;
  userChatInput: string;
}) => {
  try {
    const { answerText: checkResult, usage } = await createLLMResponse({
      body: {
        model,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: getPrompt({ userChatInput })
          },
          {
            role: 'user',
            content: userChatInput
          }
        ]
      }
    });

    const checkResponse = parseToolArgs<{ complex: boolean; reason: string }>(checkResult);

    return {
      complex: !!checkResponse?.complex,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens
    };
  } catch (error) {
    addLog.error('Simple question check failed, proceeding with normal plan flow', error);
    return {
      complex: true,
      inputTokens: 0,
      outputTokens: 0
    };
  }
};
