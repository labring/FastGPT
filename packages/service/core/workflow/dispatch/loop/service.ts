import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { DispatchFlowResponse } from '../type';
import { safePoints } from '../utils';

// ─── 1. getNestedEndOutputValue ───────────────────────────────────────────────

/**
 * Extract the output value produced by the nestedEnd node in a sub-workflow
 * response.  Returns undefined when the nestedEnd node was never reached
 * (e.g. the sub-workflow terminated with an error before completion).
 */
export const getNestedEndOutputValue = (response: DispatchFlowResponse): any =>
  response.flowResponses.find((res) => res.moduleType === FlowNodeTypeEnum.nestedEnd)
    ?.loopOutputValue;

// ─── 2. pushSubWorkflowUsage ─────────────────────────────────────────────────

/**
 * Compute the total usage points for a single sub-workflow run, push the entry
 * to the parent dispatcher's usage accumulator, and return the computed value
 * so the caller can keep a running total.
 *
 * Pattern shared by runLoop and runParallelRun:
 *   const pts = pushSubWorkflowUsage({ usagePush: props.usagePush, response, name, index });
 *   totalPoints += pts;
 */
export const pushSubWorkflowUsage = ({
  usagePush,
  response,
  name,
  index
}: {
  usagePush: (usages: ChatNodeUsageType[]) => void;
  response: DispatchFlowResponse;
  name: string;
  index: number;
}): number => {
  const itemUsagePoint = response.flowUsages.reduce(
    (acc, usage) => acc + safePoints(usage.totalPoints),
    0
  );
  usagePush([{ totalPoints: itemUsagePoint, moduleName: `${name}-${index}` }]);
  return itemUsagePoint;
};

// ─── 3. collectResponseFeedbacks ─────────────────────────────────────────────

/**
 * Append any customFeedbacks from a sub-workflow response into the provided
 * accumulator array.  Returns the same array for convenience.
 */
export const collectResponseFeedbacks = (
  response: DispatchFlowResponse,
  target: string[]
): string[] => {
  const feedbacks = response[DispatchNodeResponseKeyEnum.customFeedbacks];
  if (feedbacks && feedbacks.length > 0) {
    target.push(...feedbacks);
  }
  return target;
};
