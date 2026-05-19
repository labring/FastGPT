import type { AgentPlanType, AgentStepItemType } from '@fastgpt/global/core/ai/agent/type';

type MergeRevisedPlanResult = {
  plan: AgentPlanType;
  warnings: string[];
};

/**
 * 合并步骤证据并去重，避免 Plan Reviser 重写计划时重复保留同一条执行记录。
 */
const mergeEvidence = (
  oldEvidence: AgentStepItemType['evidence'],
  newEvidence: AgentStepItemType['evidence']
) => {
  const seen = new Set<string>();
  return [...oldEvidence, ...newEvidence].filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const createResetStep = (step: AgentStepItemType): AgentStepItemType => ({
  id: step.id,
  title: step.title,
  description: step.description,
  acceptanceCriteria: step.acceptanceCriteria,
  status: 'pending',
  evidence: []
});

const createStableDoneStep = ({
  oldStep,
  revisedStep
}: {
  oldStep: AgentStepItemType;
  revisedStep: AgentStepItemType;
}): AgentStepItemType => {
  const outputSummary = revisedStep.outputSummary ?? oldStep.outputSummary;

  return {
    id: revisedStep.id,
    title: revisedStep.title,
    description: revisedStep.description,
    acceptanceCriteria: revisedStep.acceptanceCriteria,
    status: 'done',
    evidence: mergeEvidence(oldStep.evidence, revisedStep.evidence),
    ...(outputSummary !== undefined ? { outputSummary } : {})
  };
};

/**
 * 合并重规划结果和当前计划。
 * 已完成步骤会保持 done 状态和历史证据；新出现的步骤会重置为 pending，避免继承模型幻觉出的执行状态。
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

    return {
      ...step,
      evidence: mergeEvidence(oldStep.evidence, step.evidence)
    };
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
