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

  const node = useMemo(() => nodeList.find((node) => node.nodeId === nodeId), [nodeList, nodeId]);

  /* not node/not connecting node, hidden */
  const showSourceHandle = useMemo(() => {
    if (!node) return false;
    if (connectingEdge && connectingEdge.nodeId !== nodeId) return false;
    return true;
  }, [connectingEdge, node, nodeId]);

  const RightHandle = useMemo(() => {
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
  }, [edges, node, nodeId]);
  const LeftHandlee = useMemo(() => {
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
  }, [edges, node, nodeId]);
  const TopHandlee = useMemo(() => {
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
  }, [edges, node, nodeId]);
  const BottomHandlee = useMemo(() => {
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
  }, [edges, node, nodeId]);

  return showSourceHandle ? (
    <>
      {RightHandle}
      {LeftHandlee}
      {TopHandlee}
      {BottomHandlee}
    </>
  ) : null;
};

export const ConnectionTargetHandle = ({ nodeId }: { nodeId: string }) => {
  const connectingEdge = useContextSelector(WorkflowContext, (ctx) => ctx.connectingEdge);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  const node = useMemo(() => nodeList.find((node) => node.nodeId === nodeId), [nodeList, nodeId]);

  const showHandle = useMemo(() => {
    if (!node) return false;
    if (connectingEdge && connectingEdge.nodeId === nodeId) return false;
    return true;
  }, [connectingEdge, node, nodeId]);

  const LeftHandle = useMemo(() => {
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
  }, [node, nodeId]);
  const rightHandle = useMemo(() => {
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
  }, [node, nodeId]);
  const topHandle = useMemo(() => {
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
  }, [node, nodeId]);
  const bottomHandle = useMemo(() => {
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
  }, [node, nodeId]);

  return showHandle ? (
    <>
      {LeftHandle}
      {rightHandle}
      {topHandle}
      {bottomHandle}
    </>
  ) : null;
};

export default function Dom() {
  return <></>;
}
