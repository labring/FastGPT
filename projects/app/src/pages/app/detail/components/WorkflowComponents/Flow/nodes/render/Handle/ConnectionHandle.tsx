import React, { useMemo } from 'react';
import { Position } from 'reactflow';
import { SourceHandle, TargetHandle } from '.';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../../context';

export const ConnectionSourceHandle = ({ nodeId }: { nodeId: string }) => {
  const connectingEdge = useContextSelector(WorkflowContext, (ctx) => ctx.connectingEdge);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const edges = useContextSelector(WorkflowContext, (v) => v.edges);

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

      if (!node || !node?.sourceHandle?.right || rightTargetConnected) return null;

      return (
        <SourceHandle
          nodeId={nodeId}
          handleId={handleId}
          position={Position.Right}
          translate={[2, 0]}
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
          translate={[-6, 0]}
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
          translate={[0, -2]}
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
          translate={[0, 2]}
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
  }, [connectingEdge, edges, nodeId, nodeList]);

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
  const connectingEdge = useContextSelector(WorkflowContext, (ctx) => ctx.connectingEdge);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const edges = useContextSelector(WorkflowContext, (v) => v.edges);

  const { showHandle, LeftHandle, rightHandle, topHandle, bottomHandle } = useMemo(() => {
    const node = nodeList.find((node) => node.nodeId === nodeId);
    const connectingNode = nodeList.find((node) => node.nodeId === connectingEdge?.nodeId);

    const sourceEdges = edges.filter((edge) => edge.target === connectingNode?.nodeId);
    const connectingNodeSourceNodeIds = sourceEdges.map((edge) => edge.source);

    const showHandle = (() => {
      if (!node) return false;
      // Unable to connect oneself
      if (connectingEdge && connectingEdge.nodeId === nodeId) return false;
      // Unable to connect to the source node
      if (connectingNodeSourceNodeIds.includes(nodeId)) return false;
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
          translate={[-2, 0]}
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
          translate={[2, 0]}
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
          translate={[0, -2]}
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
          translate={[0, 2]}
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

  return showHandle ? (
    <>
      {LeftHandle}
      {rightHandle}
      {topHandle}
      {bottomHandle}
    </>
  ) : null;
});

export default function Dom() {
  return <></>;
}
