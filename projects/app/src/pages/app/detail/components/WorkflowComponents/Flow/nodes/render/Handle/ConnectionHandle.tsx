import React, { useMemo } from 'react';
import { Position } from 'reactflow';
import { SourceHandle, TargetHandle } from '.';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../../context';
import { WorkflowNodeEdgeContext } from '../../../../context/workflowInitContext';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';

export const ConnectionSourceHandle = ({
  nodeId,
  isFoldNode
}: {
  nodeId: string;
  isFoldNode?: boolean;
}) => {
  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);
  const { connectingEdge, nodeList } = useContextSelector(WorkflowContext, (ctx) => ctx);

  const { showSourceHandle, RightHandle, LeftHandlee, TopHandlee, BottomHandlee } = useMemo(() => {
    const node = nodeList.find((node) => node.nodeId === nodeId);

    /* not node/not connecting node, hidden */
    const showSourceHandle = (() => {
      if (!node) return false;
      if (connectingEdge && connectingEdge.nodeId !== nodeId) return false;
      return true;
    })();

    const RightHandle = (() => {
      const handleId = getHandleId(nodeId, 'source', Position.Right);
      const rightTargetConnected = edges.some(
        (edge) => edge.targetHandle === getHandleId(nodeId, 'target', Position.Right)
      );

      /* 
        If the node is folded and has outputs, must show the handle
        hide handle when:
          - not folded
          - not node
          - not sourceHandle
          - already connected
      */
      if (
        !(isFoldNode && node?.outputs.length) &&
        (!node || !node?.sourceHandle?.right || rightTargetConnected)
      )
        return null;

      return (
        <SourceHandle
          nodeId={nodeId}
          handleId={handleId}
          position={Position.Right}
          translate={[4, 0]}
        />
      );
    })();
    const LeftHandlee = (() => {
      const leftTargetConnected = edges.some(
        (edge) => edge.targetHandle === getHandleId(nodeId, 'target', Position.Left)
      );
      if (!node || !node?.sourceHandle?.left || leftTargetConnected) return null;

      const handleId = getHandleId(nodeId, 'source', Position.Left);

      return (
        <SourceHandle
          nodeId={nodeId}
          handleId={handleId}
          position={Position.Left}
          translate={[-8, 0]}
        />
      );
    })();
    const TopHandlee = (() => {
      if (
        edges.some(
          (edge) => edge.target === nodeId && edge.targetHandle === NodeOutputKeyEnum.selectedTools
        )
      )
        return null;

      const handleId = getHandleId(nodeId, 'source', Position.Top);
      const topTargetConnected = edges.some(
        (edge) => edge.targetHandle === getHandleId(nodeId, 'target', Position.Top)
      );
      if (!node || !node?.sourceHandle?.top || topTargetConnected) return null;

      return (
        <SourceHandle
          nodeId={nodeId}
          handleId={handleId}
          position={Position.Top}
          translate={[0, -5]}
        />
      );
    })();
    const BottomHandlee = (() => {
      const handleId = getHandleId(nodeId, 'source', Position.Bottom);
      const targetConnected = edges.some(
        (edge) => edge.targetHandle === getHandleId(nodeId, 'target', Position.Bottom)
      );
      if (!node || !node?.sourceHandle?.bottom || targetConnected) return null;

      return (
        <SourceHandle
          nodeId={nodeId}
          handleId={handleId}
          position={Position.Bottom}
          translate={[0, 5]}
        />
      );
    })();

    return {
      showSourceHandle,
      RightHandle,
      LeftHandlee,
      TopHandlee,
      BottomHandlee
    };
  }, [connectingEdge, edges, nodeId, nodeList, isFoldNode]);

  return showSourceHandle ? (
    <>
      {RightHandle}
      {LeftHandlee}
      {TopHandlee}
      {BottomHandlee}
    </>
  ) : null;
};

export const ConnectionTargetHandle = React.memo(function ConnectionTargetHandle({
  nodeId
}: {
  nodeId: string;
}) {
  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);
  const { connectingEdge, nodeList } = useContextSelector(WorkflowContext, (ctx) => ctx);

  const { LeftHandle, rightHandle, topHandle, bottomHandle } = useMemo(() => {
    let node: FlowNodeItemType | undefined = undefined,
      connectingNode: FlowNodeItemType | undefined = undefined;
    for (const item of nodeList) {
      if (item.nodeId === nodeId) {
        node = item;
      }
      if (item.nodeId === connectingEdge?.nodeId) {
        connectingNode = item;
      }
      if (node && (connectingNode || !connectingEdge?.nodeId)) break;
    }

    let forbidConnect = false;
    for (const edge of edges) {
      if (forbidConnect) break;

      if (edge.target === nodeId) {
        // Node has be connected tool, it cannot be connect by other handle
        if (edge.targetHandle === NodeOutputKeyEnum.selectedTools) {
          forbidConnect = true;
        }
        // The same source handle cannot connect to the same target node
        if (
          connectingEdge &&
          connectingEdge.handleId === edge.sourceHandle &&
          edge.target === nodeId
        ) {
          forbidConnect = true;
        }
      }
    }

    const showHandle = (() => {
      if (forbidConnect) return false;
      if (!node) return false;

      // Tool connecting
      if (connectingEdge && connectingEdge.handleId === NodeOutputKeyEnum.selectedTools)
        return false;

      // Unable to connect oneself
      if (connectingEdge && connectingEdge.nodeId === nodeId) return false;
      // Not the same parent node
      if (connectingNode && connectingNode?.parentNodeId !== node?.parentNodeId) return false;

      return true;
    })();

    const LeftHandle = (() => {
      if (!node || !node?.targetHandle?.left) return null;

      const handleId = getHandleId(nodeId, 'target', Position.Left);

      return (
        <TargetHandle
          nodeId={nodeId}
          handleId={handleId}
          position={Position.Left}
          translate={[-4, 0]}
          showHandle={showHandle}
        />
      );
    })();
    const rightHandle = (() => {
      if (!node || !node?.targetHandle?.right) return null;

      const handleId = getHandleId(nodeId, 'target', Position.Right);

      return (
        <TargetHandle
          nodeId={nodeId}
          handleId={handleId}
          position={Position.Right}
          translate={[4, 0]}
          showHandle={showHandle}
        />
      );
    })();
    const topHandle = (() => {
      if (!node || !node?.targetHandle?.top) return null;

      const handleId = getHandleId(nodeId, 'target', Position.Top);

      return (
        <TargetHandle
          nodeId={nodeId}
          handleId={handleId}
          position={Position.Top}
          translate={[0, -5]}
          showHandle={showHandle}
        />
      );
    })();
    const bottomHandle = (() => {
      if (!node || !node?.targetHandle?.bottom) return null;

      const handleId = getHandleId(nodeId, 'target', Position.Bottom);

      return (
        <TargetHandle
          nodeId={nodeId}
          handleId={handleId}
          position={Position.Bottom}
          translate={[0, 5]}
          showHandle={showHandle}
        />
      );
    })();

    return {
      showHandle,
      LeftHandle,
      rightHandle,
      topHandle,
      bottomHandle
    };
  }, [connectingEdge, edges, nodeId, nodeList]);

  return (
    <>
      {LeftHandle}
      {rightHandle}
      {topHandle}
      {bottomHandle}
    </>
  );
});

export default function Dom() {
  return <></>;
}
