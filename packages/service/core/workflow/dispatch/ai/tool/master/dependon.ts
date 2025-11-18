import { getLLMModel } from '../../../../../ai/model';
import type { AgentPlanStepType } from '../sub/plan/type';
import { addLog } from '../../../../../../common/system/log';
import { createLLMResponse } from '../../../../../ai/llm/request';
import { parseToolArgs } from '../../utils';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { formatModelChars2Points } from '../../../../../../support/wallet/usage/utils';

export const getStepDependon = async ({
  model,
  steps,
  step
}: {
  model: string;
  steps: AgentPlanStepType[];
  step: AgentPlanStepType;
}): Promise<{
  depends: string[];
  usage?: ChatNodeUsageType;
}> => {
  const modelData = getLLMModel(model);
  addLog.debug('GetStepResponse start', { model, step });
  const historySummary = steps
    .filter((item) => item.summary)
    .map((item) => `- ${item.id}: ${item.summary}`)
    .join('\n');

  if (!historySummary) {
    return {
      depends: []
    };
  }
  // console.log("GetStepDependon historySummary:", step.id, historySummary);
  const prompt = `
  你是一个智能检索助手。现在需要执行一个新的步骤，请根据步骤描述和历史步骤的概括信息，判断哪些历史步骤的结果对当前步骤有帮助，并将 step_id 提取出来。
  
  【当前需要执行的步骤】
  步骤ID: ${step.id}
  步骤标题: ${step.title}
  步骤描述: ${step.description}
  
  【已完成的历史步骤概括】
  ${historySummary}
  
  【任务】
  1. 请分析当前步骤的需求，判断需要引用哪些历史步骤的详细结果。
  2. 如果不需要任何历史步骤，返回空列表；如果需要，请返回相关步骤的ID列表。
  3. 如果是一个总结性质的步骤，比如标题为“生成总结报告”，那么请返回所有已完成的历史步骤id，而不应该是一个空列表。
  
  【返回格式】（严格的JSON格式，不要包含其他文字）
  \`\`\`json
  {
    "needed_step_ids": ["step1", "step2"],
    "reason": "当前步骤需要整合美食和天气信息，因此需要 step1 和 step2 的结果"
  }
  \`\`\`
  \`\`\`json
  {
    "needed_step_ids": ["step1", "step2", "step3"],
    "reason": "当前步骤为总结性质的步骤，需要依赖所有之前步骤的信息"
  }
  \`\`\``;

  const { answerText, usage } = await createLLMResponse({
    body: {
      model: modelData.model,
      messages: [{ role: 'user', content: prompt }],
      stream: false
    }
  });
  const params = parseToolArgs<{
    needed_step_ids: string[];
    reason: string;
  }>(answerText);
  if (!params) {
    const { totalPoints, modelName } = formatModelChars2Points({
      model: modelData.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens
    });
    return {
      depends: [],
      usage: {
        moduleName: '步骤依赖分析',
        model: modelName,
        totalPoints,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      }
    };
  }

  return {
    depends: params.needed_step_ids
  };
};
