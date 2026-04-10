import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { DispatchFlowResponse } from '../type';

// ─── 1. injectNestedStartInputs ──────────────────────────────────────────────

/**
 * Mutates nodes in-place: sets the nestedStart node as entry and injects the
 * current item / 1-based index into its inputs.
 *
 * Shared by two callers with different clone strategies:
 *  - runLoop   → calls directly on the shared mutable runtimeNodes (sequential,
 *                no isolation needed between iterations).
 *  - buildTaskRuntimeContext (parallelRun/service) → calls after deep-cloning,
 *                so each task has its own isolated copy.
 */
export const injectNestedStartInputs = (
  nodes: RuntimeNodeItemType[],
  childrenNodeIdList: string[],
  item: any,
  index: number
): void => {
  nodes.forEach((node) => {
    if (!childrenNodeIdList.includes(node.nodeId)) return;
    if (node.flowNodeType === FlowNodeTypeEnum.nestedStart) {
      node.isEntry = true;
      node.inputs.forEach((input) => {
        if (input.key === NodeInputKeyEnum.nestedStartInput) {
          input.value = item;
        } else if (input.key === NodeInputKeyEnum.nestedStartIndex) {
          input.value = index + 1; // 1-based
        }
      });
    }
  });
};

// ─── 2. getNestedEndOutputValue ───────────────────────────────────────────────

/**
 * Extract the output value produced by the nestedEnd node in a sub-workflow
 * response.  Returns undefined when the nestedEnd node was never reached
 * (e.g. the sub-workflow terminated with an error before completion).
 */
export const getNestedEndOutputValue = (response: DispatchFlowResponse): any =>
  response.flowResponses.find((res) => res.moduleType === FlowNodeTypeEnum.nestedEnd)
    ?.loopOutputValue;

// ─── 3. pushSubWorkflowUsage ─────────────────────────────────────────────────

/**
 * Compute the total usage points for a single sub-workflow run, push the entry
 * to the parent dispatcher's usage accumulator, and return the computed value
 * so the caller can keep a running total.
 *
 * Pattern shared by runLoop and runParallelRun:
 *   const pts = pushSubWorkflowUsage(props.usagePush, response, name, index);
 *   totalPoints += pts;
 */
export const pushSubWorkflowUsage = (
  usagePush: (usages: ChatNodeUsageType[]) => void,
  response: DispatchFlowResponse,
  name: string,
  index: number
): number => {
  const itemUsagePoint = response.flowUsages.reduce((acc, usage) => acc + usage.totalPoints, 0);
  usagePush([{ totalPoints: itemUsagePoint, moduleName: `${name}-${index}` }]);
  return itemUsagePoint;
};

// ─── 4. collectResponseFeedbacks ─────────────────────────────────────────────

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
