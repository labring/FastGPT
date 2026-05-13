import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { AgentPlanType, AgentStepItemType } from '@fastgpt/global/core/ai/agent/type';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';

type StopGateResult =
  | {
      allowStop: true;
      reason: string;
    }
  | {
      allowStop: false;
      reason: string;
      feedbackMessage: ChatCompletionMessageParam;
    };

const isResolvedStatus = (status: AgentStepItemType['status']) =>
  status === 'done' || status === 'skipped' || status === 'blocked';

const formatStep = (step: AgentStepItemType) => `- ${step.id}: ${step.title} (${step.status})`;

/**
 * 本地停止门。
 * 模型准备最终回答时调用；如果 activePlan 尚未完成，就返回一条 synthetic feedback 让同一个主 loop 继续。
 */
export const runStopGate = ({
  activePlan,
  runtimeToolCalledSinceLastPlanUpdate,
  requirePlan
}: {
  activePlan?: AgentPlanType;
  runtimeToolCalledSinceLastPlanUpdate?: boolean;
  requirePlan?: boolean;
}): StopGateResult => {
  if (!activePlan) {
    if (requirePlan) {
      return {
        allowStop: false,
        reason: 'Explicit plan requirement has no active plan.',
        feedbackMessage: {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: [
            '<stop_gate_feedback>',
            'You cannot finish yet.',
            'The user explicitly requested a plan, plan mode, step breakdown, or per-step plan updates.',
            'Call update_plan with action set_plan before final answer. Keep the plan concise, then execute or update the steps until resolved.',
            '</stop_gate_feedback>'
          ].join('\n')
        }
      };
    }

    return {
      allowStop: true,
      reason: 'No active plan.'
    };
  }

  const needsReplanSteps = activePlan.steps.filter((step) => step.needsReplan);
  const incompleteSteps = activePlan.steps.filter((step) => !isResolvedStatus(step.status));
  const invalidBlockedSteps = activePlan.steps.filter(
    (step) => step.status === 'blocked' && !step.blocker
  );

  const missingItems = [
    ...needsReplanSteps.map((step) => `${formatStep(step)} needs replan.`),
    ...incompleteSteps.map(formatStep),
    ...invalidBlockedSteps.map((step) => `${formatStep(step)} is blocked without blocker.`)
  ];

  if (missingItems.length === 0 && !runtimeToolCalledSinceLastPlanUpdate) {
    return {
      allowStop: true,
      reason: 'Active plan is complete.'
    };
  }

  const runtimeToolHint = runtimeToolCalledSinceLastPlanUpdate
    ? '\nYou used runtime tools after the last plan update. Call update_plan to record the result before final answer.'
    : '';
  const feedbackItems =
    missingItems.length > 0
      ? ['The active plan still has unresolved items:', ...missingItems]
      : ['The active plan is resolved, but recent runtime tool results are not recorded yet.'];

  return {
    allowStop: false,
    reason:
      missingItems.length > 0
        ? 'Active plan is not complete.'
        : 'Runtime tool result is not recorded in active plan.',
    feedbackMessage: {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: [
        '<stop_gate_feedback>',
        'You cannot finish yet.',
        ...feedbackItems,
        runtimeToolHint,
        'Continue the task. Use runtime tools if more information is needed, or call update_plan to complete, block, skip, or revise these steps.',
        '</stop_gate_feedback>'
      ]
        .filter(Boolean)
        .join('\n')
    }
  };
};
