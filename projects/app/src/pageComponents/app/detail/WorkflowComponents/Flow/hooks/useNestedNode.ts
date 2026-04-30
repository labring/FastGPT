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
import { WorkflowBufferDataContext, WorkflowInitContext } from '../../context/workflowInitContext';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';
import { WorkflowLayoutContext } from '../../context/workflowComputeContext';
import { getWorkflowGlobalVariables } from '@/web/core/workflow/utils';
import { AppContext } from '../../../context';

type UseNestedNodeParams = {
  nodeId: string;
  inputs: FlowNodeInputItemType[];
  // Pass `undefined` to skip array valueType inference (loopRun conditional mode).
  arrayInputKey?: NodeInputKeyEnum;
};

type UseNestedNodeResult = {
  nodeWidth: number;
  nodeHeight: number;
  inputBoxRef: React.RefObject<HTMLDivElement>;
};

// Shared hook for nested-container nodes (Loop / ParallelRun / LoopRun).
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
  // 订阅子节点尺寸变化：ReactFlow 完成测量后会更新 node.width / node.height,
  // 把它们压成字符串当 signal,有变化就重算 bounds,避免 50ms 定时器抢跑在测量前。
  const childDimensionsSignal = useContextSelector(WorkflowInitContext, (v) => {
    let signal = '';
    for (const node of v.nodes) {
      if (node.data.parentNodeId === nodeId) {
        signal += `${node.id}:${node.width ?? 0}x${node.height ?? 0}|`;
      }
    }
    return signal;
  });
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

  // ── 3a. Maintain childrenNodeIdList ─────────────────────────────────────────
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
  }, [childNodeIds, nodeId, onChangeNode]);

  // ── 3b. Trigger layout reset on child id / dimension change ─────────────────
  // 依赖 childDimensionsSignal,子节点被 ReactFlow 测量出新的 w/h 后会再触发一次,
  // 确保 bounds 计算基于真实尺寸,而不是赶在 50ms 定时器到期时还是 0 的状态。
  useEffect(() => {
    const timer = setTimeout(() => resetParentNodeSizeAndPosition(nodeId), 50);
    return () => clearTimeout(timer);
  }, [childNodeIds, childDimensionsSignal, nodeId, resetParentNodeSizeAndPosition]);

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
