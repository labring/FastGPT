import React, { useContext, useMemo } from 'react';
import { Position } from '@xyflow/react';
import { MySourceHandle, MyTargetHandle } from '.';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';
import { checkExecutionConnection } from '@fastgpt/workflow-core/edge/validation';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useNode } from '@/web/core/workflow/editor/react/useNode';
import { useWorkflow } from '@/web/core/workflow/editor/react/useWorkflow';
import { useWorkflowRuntime } from '@/web/core/workflow/editor/session/workflowSession';
import { useWorkflowUIValue } from '../../../canvas/canvasState';
import { WorkflowHandleRenderContext } from './handleRenderContext';
import { getFoldedSourceHandleIds } from './utils';

/** 保留稳定数组身份；左右额外偏移由 MySourceHandle/MyTargetHandle 按状态计算。 */
const sourceTranslate = [9, 0] as [number, number];
const targetTranslate = [-9, 0] as [number, number];

export const ConnectionSourceHandle = ({
  nodeId,
  sourceType = 'source'
}: {
  nodeId: string;
  sourceType?: 'source' | 'source_catch';
}) => {
  const renderHandle = useContext(WorkflowHandleRenderContext);
  const nodeHandle = useNode(nodeId, { raw: true });
  // 只关心「是不是别的节点在拖拽连线」这一个事实，不取回整个 connectingEdge 对象。
  const isConnectingOther = useWorkflowUIValue(
    (v) => !!v.connectingEdge && v.connectingEdge.nodeId !== nodeId
  );
  // 右侧 target 柄已被占用时不再显示 source 柄：走图查询的 byTarget 索引，O(入度)。
  const rightTargetConnected = useWorkflow((_structure, graph) =>
    graph.isHandleConnected({
      nodeId,
      handleId: getHandleId(nodeId, 'target', Position.Right),
      direction: 'target'
    })
  );

  const { showSourceHandle, RightHandle } = useMemo(() => {
    const node = nodeHandle?.data;

    /* not node/not connecting node, hidden */
    const showSourceHandle = (() => {
      if (!node) return false;
      if (isConnectingOther) return false;
      return true;
    })();

    const RightHandle = (() => {
      // 折叠只合并端口位置，不卸载端口，避免已有连线失去 ReactFlow handle。
      if (node && nodeHandle?.view.isFolded && sourceType === 'source') {
        return (
          <>
            {getFoldedSourceHandleIds({
              ...node,
              id: nodeId,
              showSourceHandle: moduleTemplatesFlat.find(
                (item) => item.flowNodeType === node.flowNodeType
              )?.showSourceHandle
            } as unknown as FlowNodeItemType).map((handleId, index) => (
              <MySourceHandle
                key={handleId}
                nodeId={nodeId}
                handleId={handleId}
                position={Position.Right}
                translate={[4, 0]}
                showHandle={index === 0}
              />
            ))}
          </>
        );
      }

      const handleId = getHandleId(nodeId, sourceType, Position.Right);
      // 连接柄显隐由当前模板决定：文档节点不携带模板展示字段。
      const templateShowSourceHandle = node
        ? moduleTemplatesFlat.find((item) => item.flowNodeType === node.flowNodeType)
            ?.showSourceHandle
        : undefined;
      if (!node || !templateShowSourceHandle || rightTargetConnected) {
        return null;
      }

      return (
        <MySourceHandle
          nodeId={nodeId}
          handleId={handleId}
          position={Position.Right}
          translate={sourceTranslate}
        />
      );
    })();

    return {
      showSourceHandle,
      RightHandle
    };
  }, [nodeHandle, nodeId, isConnectingOther, sourceType, rightTargetConnected]);

  return renderHandle && showSourceHandle ? <>{RightHandle}</> : null;
};

export const ConnectionTargetHandle = React.memo(function ConnectionTargetHandle({
  nodeId
}: {
  nodeId: string;
}) {
  const renderHandle = useContext(WorkflowHandleRenderContext);
  const connectingEdge = useWorkflowUIValue((v) => v.connectingEdge);
  const runtime = useWorkflowRuntime();
  const edges = useWorkflow((structure) => structure.edges);
  const connectingNodeId = connectingEdge?.nodeId ?? nodeId;
  const targetNode = useNode(nodeId, (node) => node?.data);
  const sourceNode = useNode(connectingNodeId, (node) => node?.data);
  const handleId = getHandleId(nodeId, 'target', Position.Left);
  const allowed = useMemo(() => {
    if (!connectingEdge) return true;
    if (!runtime) return false;

    const nodes = runtime.getWorkflowData().nodes;
    return checkExecutionConnection({
      connection: {
        source: connectingEdge.nodeId,
        sourceHandle: connectingEdge.handleId,
        target: nodeId,
        targetHandle: handleId
      },
      edges: [...edges],
      getNodeById: (id) => nodes.find((node) => node.nodeId === id)
    }).allowed;
  }, [connectingEdge, edges, handleId, nodeId, runtime, sourceNode, targetNode]);
  const showTargetHandle = targetNode
    ? moduleTemplatesFlat.find((item) => item.flowNodeType === targetNode.flowNodeType)
        ?.showTargetHandle
    : undefined;

  if (!renderHandle || !showTargetHandle) return null;
  return (
    <MyTargetHandle
      nodeId={nodeId}
      handleId={handleId}
      position={Position.Left}
      translate={targetTranslate}
      showHandle={allowed}
    />
  );
});
