import type { AgentPlanType, AgentStepItemType } from '@fastgpt/global/core/ai/agent/type';

type MergeRevisedPlanResult = {
  plan: AgentPlanType;
  warnings: string[];
};

const createResetStep = (step: AgentStepItemType): AgentStepItemType => ({
  id: step.id,
  name: step.name,
  description: step.description,
  status: 'pending'
});

const createStableDoneStep = ({
  oldStep,
  revisedStep
}: {
  oldStep: AgentStepItemType;
  revisedStep: AgentStepItemType;
}): AgentStepItemType => ({
  id: revisedStep.id,
  name: revisedStep.name,
  description: revisedStep.description,
  status: 'done',
  ...(oldStep.note ? { note: oldStep.note } : revisedStep.note ? { note: revisedStep.note } : {})
});

/**
 * 合并重规划结果和当前计划。
 * 已完成步骤会保持 done 状态和备注；新出现的步骤会重置为 pending，避免继承模型幻觉出的执行状态。
 */
export const mergeStableCompletedSteps = ({
  currentPlan,
  revisedPlan
}: {
  currentPlan: AgentPlanType;
  revisedPlan: AgentPlanType;
}): MergeRevisedPlanResult => {
  const warnings: string[] = [];
  const revisedStepMap = new Map(revisedPlan.steps.map((step) => [step.id, step]));
  const currentStepMap = new Map(currentPlan.steps.map((step) => [step.id, step]));

  const mergedSteps = revisedPlan.steps.map((step) => {
    const oldStep = currentStepMap.get(step.id);
    if (!oldStep) {
      return createResetStep(step);
    }

    if (oldStep.status === 'done') {
      return createStableDoneStep({
        oldStep,
        revisedStep: step
      });
    }

    return step;
  });

  currentPlan.steps.forEach((step) => {
    if (step.status !== 'done' || revisedStepMap.has(step.id)) return;

    warnings.push(`Reviser dropped completed step "${step.id}", merged it back.`);
    mergedSteps.push(step);
  });

  return {
    plan: {
      ...revisedPlan,
      steps: mergedSteps
    },
    warnings
  };
};
