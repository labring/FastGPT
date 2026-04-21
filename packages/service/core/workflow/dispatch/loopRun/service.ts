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

export const pickCustomOutputInputs = (inputs: FlowNodeInputItemType[]): FlowNodeInputItemType[] =>
  inputs.filter((i) => i.canEdit === true);

export const extractFinishedNodeIds = (flowResponses: ChatHistoryItemResType[]): Set<string> => {
  const ids = new Set<string>();
  for (const r of flowResponses) {
    if (r.nodeId) ids.add(r.nodeId);
  }
  return ids;
};

/**
 * When `finishedNodeIds` is provided (failure iteration), refs whose target
 * did not run resolve to undefined so stale values from earlier iterations
 * don't leak. Global variable refs bypass the filter.
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
      // Single reference: [nodeId, outputId?]  — refValue[0] is a string
      // Reference array:  [[nodeId, outputId?], ...] — refValue[0] is a tuple
      const refs: [string, string | undefined][] = !Array.isArray(refValue)
        ? []
        : Array.isArray(refValue[0])
          ? (refValue as [string, string | undefined][])
          : [refValue as [string, string | undefined]];

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
 * Array mode injects 0-based index; conditional mode injects 1-based iteration.
 * Mutates in place.
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

export const isLoopBreakHit = (flowResponses: ChatHistoryItemResType[]): boolean =>
  flowResponses.some((r) => r.moduleType === FlowNodeTypeEnum.loopRunBreak);

export const hasLoopRunBreakChild = (
  runtimeNodes: RuntimeNodeItemType[],
  childrenNodeIdList: string[]
): boolean => {
  const childSet = new Set(childrenNodeIdList);
  return runtimeNodes.some(
    (n) => childSet.has(n.nodeId) && n.flowNodeType === FlowNodeTypeEnum.loopRunBreak
  );
};
