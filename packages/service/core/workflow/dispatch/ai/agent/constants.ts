import type { AgentPlanStepType } from './sub/plan/type';
import type { AgentPlanType } from './sub/plan/type';

export const getMasterAgentSystemPrompt = ({
  steps,
  step,
  userInput,
  background = ''
}: {
  steps: AgentPlanStepType[];
  step: AgentPlanStepType;
  userInput: string;
  background?: string;
}) => {
  const stepPrompt = steps
    .filter((item) => step.depends_on && step.depends_on.includes(item.id))
    .map((item) => `-步骤ID: ${item.id}\n\t步骤标题: ${item.title}\n\t执行结果: ${item.response}`)
    .filter(Boolean)
    .join('\n');

  return `请根据任务背景、之前步骤的执行结果和当前步骤要求选择并调用相应的工具。如果是一个总结性质的步骤，请整合之前步骤的结果进行总结。
【任务背景】
目标: ${userInput}
前置信息: ${background}

【当前步骤】
步骤ID: ${step.id}
步骤标题: ${step.title}

${
  stepPrompt
    ? `【之前步骤的执行结果】
${stepPrompt}`
    : ''
}

【执行指导】
1. 仔细阅读前面步骤的执行结果，理解已经获得的信息
2. 根据当前步骤描述和前面的结果，分析需要使用的工具
3. 从可用工具列表中选择最合适的工具
4. 基于前面步骤的结果为工具生成合理的参数
5. 如果需要多个工具，可以同时调用
6. 确保当前步骤的执行能够有效利用和整合前面的结果
7. 如果是总结的步骤，请利用之前步骤的信息进行全面总结

请严格按照步骤描述执行，确保完成所有要求的子任务。`;
};
