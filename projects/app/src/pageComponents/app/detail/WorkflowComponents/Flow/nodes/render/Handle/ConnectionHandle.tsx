import React, { useMemo } from 'react';
import { Position } from 'reactflow';
import { MySourceHandle, MyTargetHandle } from '.';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';
import { checkExecutionConnection } from '@fastgpt/workflow-core/edge/validation';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../../../context/workflowInitContext';
import { WorkflowActionsContext } from '../../../../context/workflowActionsContext';
import { getFoldedSourceHandleIds } from './utils';

/** 视觉隐藏不卸载真实端口，折叠时所有分支共用右侧位置。 */
export const ConnectionSourceHandle = ({
  nodeId,
  sourceType = 'source'
}: {
  nodeId: string;
  sourceType?: 'source' | 'source_catch';
}) => {
  const node = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodeById(nodeId));
  if (!node) return null;

  if (node.isFolded && sourceType === 'source') {
    return (
      <>
        {getFoldedSourceHandleIds(node).map((handleId, index) => (
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

  if (!node.showSourceHandle) return null;
  return (
    <MySourceHandle
      nodeId={nodeId}
      handleId={getHandleId(nodeId, sourceType, Position.Right)}
      position={Position.Right}
      translate={[4, 0]}
    />
  );
};

export const ConnectionTargetHandle = React.memo(function ConnectionTargetHandle({
  nodeId
}: {
  nodeId: string;
}) {
  const edges = useContextSelector(WorkflowBufferDataContext, (v) => v.edges);
  const getNodeById = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodeById);
  const connectingEdge = useContextSelector(WorkflowActionsContext, (v) => v.connectingEdge);

  const node = getNodeById(nodeId);
  const handleId = getHandleId(nodeId, 'target', Position.Left);
  const allowed = useMemo(() => {
    if (!connectingEdge) return true;
    return checkExecutionConnection({
      connection: {
        source: connectingEdge.nodeId,
        sourceHandle: connectingEdge.handleId,
        target: nodeId,
        targetHandle: handleId
      },
      edges,
      getNodeById
    }).allowed;
  }, [connectingEdge, edges, getNodeById, handleId, nodeId]);

  if (!node?.showTargetHandle) return null;
  return (
    <MyTargetHandle
      nodeId={nodeId}
      handleId={handleId}
      position={Position.Left}
      translate={[-4, 0]}
      showHandle={allowed}
    />
  );
});
