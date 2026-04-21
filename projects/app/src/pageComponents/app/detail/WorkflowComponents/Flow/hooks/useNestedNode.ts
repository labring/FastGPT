import { useEffect, useMemo, useRef } from 'react';
import { useSize } from 'ahooks';
import { useContextSelector } from 'use-context-selector';
import {
  ArrayTypeMap,
  NodeInputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  Input_Template_Children_Node_List,
  Input_Template_NESTED_NODE_OFFSET
} from '@fastgpt/global/core/workflow/template/input';
import { isValidArrayReferenceValue } from '@fastgpt/global/core/workflow/utils';
import { type ReferenceArrayValueType } from '@fastgpt/global/core/workflow/type/io';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { WorkflowBufferDataContext } from '../../context/workflowInitContext';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';
import { WorkflowLayoutContext } from '../../context/workflowComputeContext';
import { getWorkflowGlobalVariables } from '@/web/core/workflow/utils';
import { AppContext } from '../../../context';

type UseNestedNodeParams = {
  nodeId: string;
  inputs: FlowNodeInputItemType[];
  /**
   * Key of the array-input whose valueType should be inferred from the
   * referenced output. Defaults to `nestedInputArray` (used by loop /
   * parallelRun). loopRun passes `loopRunInputArray` in array mode and
   * `undefined` in conditional mode to skip inference entirely.
   */
  arrayInputKey?: NodeInputKeyEnum;
};

type UseNestedNodeResult = {
  nodeWidth: number;
  nodeHeight: number;
  inputBoxRef: React.RefObject<HTMLDivElement>;
};

/**
 * Shared hook for nested-container nodes (Loop / ParallelRun / LoopRun).
 *
 * Encapsulates five pieces of logic that are identical across those components:
 *  1. Read nodeWidth / nodeHeight / nestedInputArray / loopNodeInputHeight from inputs
 *  2. Infer array valueType from the referenced output and sync it back
 *     (skipped when `arrayInputKey` is undefined — e.g. loopRun conditional mode)
 *  3. Maintain childrenNodeIdList and trigger resetParentNodeSizeAndPosition
 *  4. Measure the input-box height with useSize and sync nestedNodeInputHeight
 *  5. Trigger resetParentNodeSizeAndPosition after height changes
 *
 * Returns only what the component JSX needs (nodeWidth, nodeHeight, inputBoxRef).
 */
export const useNestedNode = ({
  nodeId,
  inputs,
  arrayInputKey = NodeInputKeyEnum.nestedInputArray
}: UseNestedNodeParams): UseNestedNodeResult => {
  const { getNodeById, nodeIds, childNodeIds, getNodeList, systemConfigNode } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => {
      return {
        getNodeById: v.getNodeById,
        nodeIds: v.nodeIds,
        childNodeIds: v.childrenNodeIdListMap[nodeId],
        getNodeList: v.getNodeList,
        systemConfigNode: v.systemConfigNode
      };
    }
  );
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const resetParentNodeSizeAndPosition = useContextSelector(
    WorkflowLayoutContext,
    (v) => v.resetParentNodeSizeAndPosition
  );

  // ── 1. Read sizing & array input from inputs ────────────────────────────────
  const computedResult = useMemoEnhance(() => {
    return {
      nodeWidth: Math.round(
        Number(inputs.find((input) => input.key === NodeInputKeyEnum.nodeWidth)?.value) || 500
      ),
      nodeHeight: Math.round(
        Number(inputs.find((input) => input.key === NodeInputKeyEnum.nodeHeight)?.value) || 500
      ),
      nestedInputArray: arrayInputKey
        ? inputs.find((input) => input.key === arrayInputKey)
        : undefined,
      loopNodeInputHeight: inputs.find(
        (input) => input.key === NodeInputKeyEnum.nestedNodeInputHeight
      )
    };
  }, [inputs, arrayInputKey]);

  const nestedInputArray = useMemoEnhance(
    () => computedResult.nestedInputArray,
    [computedResult.nestedInputArray]
  );
  const nodeWidth = computedResult.nodeWidth;
  const nodeHeight = computedResult.nodeHeight;
  const loopNodeInputHeight =
    computedResult.loopNodeInputHeight ?? Input_Template_NESTED_NODE_OFFSET;

  // ── 2. Infer array valueType from referenced output ─────────────────────────
  const newValueType = useMemo(() => {
    if (!nestedInputArray) return WorkflowIOValueTypeEnum.arrayAny;
    const value = nestedInputArray.value as ReferenceArrayValueType;

    if (!value || value.length === 0 || !isValidArrayReferenceValue(value, nodeIds)) {
      return WorkflowIOValueTypeEnum.arrayAny;
    }

    const globalVariables = getWorkflowGlobalVariables({
      systemConfigNode,
      chatConfig: appDetail.chatConfig
    });

    const valueType = ((ref) => {
      if (ref?.[0] === VARIABLE_NODE_ID) {
        return globalVariables.find((item) => item.key === ref[1])?.valueType;
      } else {
        const node = getNodeById(ref?.[0]);
        const output = node?.outputs.find((output) => output.id === ref?.[1]);
        return output?.valueType;
      }
    })(value[0]);

    return ArrayTypeMap[valueType as keyof typeof ArrayTypeMap] ?? WorkflowIOValueTypeEnum.arrayAny;
  }, [appDetail.chatConfig, getNodeById, nestedInputArray, nodeIds, systemConfigNode]);

  useEffect(() => {
    if (!nestedInputArray || !arrayInputKey || nestedInputArray.valueType === newValueType) return;
    onChangeNode({
      nodeId,
      type: 'updateInput',
      key: arrayInputKey,
      value: {
        ...nestedInputArray,
        valueType: newValueType
      }
    });
  }, [nestedInputArray, newValueType, nodeId, onChangeNode, arrayInputKey]);

  // ── 3. Maintain childrenNodeIdList ──────────────────────────────────────────
  useEffect(() => {
    onChangeNode({
      nodeId,
      type: 'updateInput',
      key: NodeInputKeyEnum.childrenNodeIdList,
      value: {
        ...Input_Template_Children_Node_List,
        value: childNodeIds
      }
    });
    // 等待 ReactFlow 完成新子节点的宽高测量后再计算,否则 bounds 会少算整个新节点
    const timer = setTimeout(() => resetParentNodeSizeAndPosition(nodeId), 50);
    return () => clearTimeout(timer);
  }, [childNodeIds, nodeId, onChangeNode, resetParentNodeSizeAndPosition]);

  // ── 4 & 5. Measure input-box height, sync and re-layout ────────────────────
  const inputBoxRef = useRef<HTMLDivElement>(null);
  const size = useSize(inputBoxRef);
  useEffect(() => {
    if (!size?.height) return;

    onChangeNode({
      nodeId,
      type: 'replaceInput',
      key: NodeInputKeyEnum.nestedNodeInputHeight,
      value: {
        ...loopNodeInputHeight,
        value: size.height
      }
    });

    const timer = setTimeout(() => resetParentNodeSizeAndPosition(nodeId), 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size?.height]);

  return { nodeWidth, nodeHeight, inputBoxRef };
};
