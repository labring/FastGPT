import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import {
  formatVariableValByType,
  getReferenceVariableValue
} from '@fastgpt/global/core/workflow/runtime/utils';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import type { DispatchFlowResponse } from '../type';
import { safePoints } from '../utils';

export type LoopRunHistoryItem = {
  iteration: number;
  customOutputs: Record<string, any>;
  success: boolean;
  error?: string;
};

/**
 * Pick declaration inputs (canEdit === true). Each such input represents a
 * user-declared custom output of the loopRun node: input.key is the output
 * field name, input.value holds a reference into the sub-workflow, and
 * input.valueType is the declared type.
 */
export const pickCustomOutputInputs = (inputs: FlowNodeInputItemType[]): FlowNodeInputItemType[] =>
  inputs.filter((i) => i.canEdit === true);

/**
 * Extract the set of nodeIds that actually produced a response in the current
 * iteration. Used to filter refs for the failure-iteration snapshot so that
 * stale values from previous iterations do not leak through.
 */
export const extractFinishedNodeIds = (flowResponses: ChatHistoryItemResType[]): Set<string> => {
  const ids = new Set<string>();
  for (const r of flowResponses) {
    if (r.nodeId) ids.add(r.nodeId);
  }
  return ids;
};

/**
 * Resolve each custom-output reference against runtimeNodes / variables.
 *
 * `finishedNodeIds` provided (failure iteration):
 *   refs whose target node is NOT in the set → undefined. Global variable refs
 *   (nodeId === VARIABLE_NODE_ID) bypass the filter (they don't depend on
 *   iteration-local execution).
 *
 * `finishedNodeIds` undefined (success iteration): resolve all refs normally.
 */
export const readCustomOutputSnapshot = ({
  customOutputInputs,
  runtimeNodes,
  variables,
  finishedNodeIds
}: {
  customOutputInputs: FlowNodeInputItemType[];
  runtimeNodes: RuntimeNodeItemType[];
  variables: Record<string, any>;
  finishedNodeIds?: Set<string>;
}): Record<string, any> => {
  const nodesMap = new Map(runtimeNodes.map((n) => [n.nodeId, n]));
  const snapshot: Record<string, any> = {};

  for (const item of customOutputInputs) {
    const refValue = item.value;

    if (finishedNodeIds) {
      const firstIsTuple =
        Array.isArray(refValue) && refValue.length === 2 && typeof refValue[0] === 'string';
      const refs: [string, string | undefined][] = firstIsTuple
        ? [refValue as [string, string | undefined]]
        : Array.isArray(refValue)
          ? (refValue as [string, string | undefined][])
          : [];

      const allFinished = refs.every(([nodeId]) => {
        if (!nodeId) return true;
        if (nodeId === VARIABLE_NODE_ID) return true;
        return finishedNodeIds.has(nodeId);
      });
      if (!allFinished) {
        snapshot[item.key] = undefined;
        continue;
      }
    }

    const resolved = getReferenceVariableValue({
      value: refValue,
      nodesMap,
      variables
    });
    snapshot[item.key] = formatVariableValByType(resolved, item.valueType);
  }

  return snapshot;
};

/**
 * Mutates nodes in-place: mark the loopRunStart node (within this loopRun
 * container's children) as entry and inject iteration values.
 *
 * - array mode     : nestedStartInput = item, nestedStartIndex = index (0-based)
 * - conditional    : nestedStartIndex = iteration (1-based)
 */
export const injectLoopRunStart = ({
  nodes,
  childrenNodeIdList,
  mode,
  item,
  index,
  iteration
}: {
  nodes: RuntimeNodeItemType[];
  childrenNodeIdList: string[];
  mode: LoopRunModeEnum;
  item?: any;
  index?: number;
  iteration: number;
}): void => {
  nodes.forEach((node) => {
    if (!childrenNodeIdList.includes(node.nodeId)) return;
    if (node.flowNodeType !== FlowNodeTypeEnum.loopRunStart) return;

    node.isEntry = true;
    node.inputs.forEach((input) => {
      if (input.key === NodeInputKeyEnum.loopRunMode) {
        input.value = mode;
      } else if (input.key === NodeInputKeyEnum.nestedStartInput) {
        input.value = mode === LoopRunModeEnum.array ? item : undefined;
      } else if (input.key === NodeInputKeyEnum.nestedStartIndex) {
        input.value = mode === LoopRunModeEnum.array ? index ?? 0 : iteration;
      }
    });
  });
};

/**
 * Per-iteration usage accounting: sum points for one sub-workflow run, push an
 * entry to the parent dispatcher's accumulator, return the value so the caller
 * can keep a running total.
 */
export const pushSubWorkflowUsage = ({
  usagePush,
  response,
  name,
  iteration
}: {
  usagePush: (usages: ChatNodeUsageType[]) => void;
  response: DispatchFlowResponse;
  name: string;
  iteration: number;
}): number => {
  const itemUsagePoint = response.flowUsages.reduce(
    (acc, usage) => acc + safePoints(usage.totalPoints),
    0
  );
  usagePush([{ totalPoints: itemUsagePoint, moduleName: `${name}-${iteration}` }]);
  return itemUsagePoint;
};

/**
 * Append any customFeedbacks from a sub-workflow response into an accumulator.
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

/** Was a loopRunBreak signal node hit during this iteration? */
export const isLoopBreakHit = (flowResponses: ChatHistoryItemResType[]): boolean =>
  flowResponses.some((r) => r.moduleType === FlowNodeTypeEnum.loopRunBreak);

/**
 * Is there at least one loopRunBreak node inside this loopRun's sub-workflow?
 * Used in conditional mode to reject workflows that would loop forever until
 * the WORKFLOW_MAX_LOOP_TIMES safety bound fires.
 */
export const hasLoopRunBreakChild = (
  runtimeNodes: RuntimeNodeItemType[],
  childrenNodeIdList: string[]
): boolean => {
  const childSet = new Set(childrenNodeIdList);
  return runtimeNodes.some(
    (n) => childSet.has(n.nodeId) && n.flowNodeType === FlowNodeTypeEnum.loopRunBreak
  );
};
