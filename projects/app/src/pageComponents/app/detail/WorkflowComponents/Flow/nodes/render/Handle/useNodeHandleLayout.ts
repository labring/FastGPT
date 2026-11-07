import { useLayoutEffect } from 'react';
import { useUpdateNodeInternals } from 'reactflow';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';

/**
 * 节点配置提交后显式刷新端口，包括等高排序、端口换 ID 和折叠。
 * 尺寸变化仍由 React Flow 的 ResizeObserver 处理；悬停和拖线高亮不改变端口几何信息。
 */
export const useNodeHandleLayout = ({
  node,
  toolConnected,
  language
}: {
  node: FlowNodeItemType;
  toolConnected: boolean;
  language: string;
}) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const {
    nodeId,
    inputs,
    outputs,
    isFolded,
    catchError,
    showSourceHandle,
    showTargetHandle,
    name,
    intro
  } = node;

  useLayoutEffect(() => {
    updateNodeInternals(nodeId);
  }, [
    nodeId,
    inputs,
    outputs,
    isFolded,
    catchError,
    showSourceHandle,
    showTargetHandle,
    name,
    intro,
    toolConnected,
    language,
    updateNodeInternals
  ]);
};
