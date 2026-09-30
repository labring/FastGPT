import { useContext, useEffect, useMemo, useRef } from 'react';
import { useContextSelector } from 'use-context-selector';
import {
  ArrayTypeMap,
  NodeInputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { isValidArrayReferenceValue } from '@fastgpt/global/core/workflow/utils';
import { type ReferenceArrayValueType } from '@fastgpt/global/core/workflow/type/io';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { getWorkflowGlobalVariables } from '@/web/core/workflow/utils';
import { useNode, useWorkflowValue } from '@/web/core/workflow/editor';
import { useDocumentGetNodeById } from '../nodes/render/useWorkflowDocument';
import { AppContext } from '../../../context';
import { WorkflowCanvasContext } from '../context/workflowCanvasContext';
import { WorkflowNodeMeasurementContext } from '../nodes/render/Handle/handleRenderContext';

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

/** 为 Loop / ParallelRun / LoopRun 读取容器内容区的 renderer 派生尺寸。 */
export const useNestedNode = ({
  nodeId,
  inputs,
  arrayInputKey = NodeInputKeyEnum.nestedInputArray
}: UseNestedNodeParams): UseNestedNodeResult => {
  // 这里只用到「全量节点 id」与「按 id 查一个节点的 outputs」：
  // id 列表属结构通道（单字段提交不通知），查节点走非订阅 getter，两者都不需要整份语义快照。
  const structureNodes = useWorkflowValue((structure) => structure.nodes);
  const getNodeById = useDocumentGetNodeById();
  const node = useNode(nodeId);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const containerLayout = useContextSelector(WorkflowCanvasContext, (value) =>
    value.containerLayouts.get(nodeId)
  );
  const isMeasurement = useContext(WorkflowNodeMeasurementContext);

  // ── 1. Read the container array input（外框尺寸是常量，不再从 inputs 读）─────
  const nestedInputArray = useMemoEnhance(
    () => (arrayInputKey ? inputs.find((input) => input.key === arrayInputKey) : undefined),
    [inputs, arrayInputKey]
  );
  // ── 2. Infer array valueType from referenced output ─────────────────────────
  const newValueType = useMemo(() => {
    if (!nestedInputArray) return WorkflowIOValueTypeEnum.arrayAny;
    const value = nestedInputArray.value as ReferenceArrayValueType;

    const nodeIds = structureNodes.map((item) => item.nodeId);
    if (!value || value.length === 0 || !isValidArrayReferenceValue(value, nodeIds)) {
      return WorkflowIOValueTypeEnum.arrayAny;
    }

    const globalVariables = getWorkflowGlobalVariables({
      chatConfig: appDetail.chatConfig
    });

    const valueType = ((ref) => {
      if (ref?.[0] === VARIABLE_NODE_ID) {
        return globalVariables.find((item) => item.key === ref[1])?.valueType;
      } else {
        const sourceNode = getNodeById(ref?.[0]);
        const output = sourceNode?.outputs.find((output) => output.id === ref?.[1]);
        return output?.valueType;
      }
    })(value[0]);

    return ArrayTypeMap[valueType as keyof typeof ArrayTypeMap] ?? WorkflowIOValueTypeEnum.arrayAny;
  }, [appDetail.chatConfig, nestedInputArray, structureNodes, getNodeById]);

  useEffect(() => {
    if (!nestedInputArray || !arrayInputKey || nestedInputArray.valueType === newValueType) return;
    // 记录级替换：基准取派发瞬间的文档 inputs（不是 props 里过滤后的子集），只换命中 key 的那一条。
    node?.updateNode((current) => ({
      inputs: current.inputs.map((input) =>
        input.key === arrayInputKey ? { ...input, valueType: newValueType } : input
      )
    }));
  }, [nestedInputArray, newValueType, node, arrayInputKey]);

  // 容器子区域只消费 renderer 派生尺寸；离屏测量跳过该尺寸，才能得到可收缩的自身内容基线。
  const inputBoxRef = useRef<HTMLDivElement>(null);

  return {
    nodeWidth: isMeasurement ? 0 : (containerLayout?.childWidth ?? 0),
    nodeHeight: isMeasurement ? 0 : (containerLayout?.childHeight ?? 0),
    inputBoxRef
  };
};
