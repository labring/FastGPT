import React, { useMemo } from 'react';
import { Position } from 'reactflow';
import { MySourceHandle, MyTargetHandle } from '.';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../../../context/workflowInitContext';
import { WorkflowActionsContext } from '../../../../context/workflowActionsContext';

export const ConnectionSourceHandle = ({
  nodeId,
  sourceType = 'source'
}: {
  nodeId: string;
  sourceType?: 'source' | 'source_catch';
}) => {
  const { edges, getNodeById } = useContextSelector(WorkflowBufferDataContext, (v) => v);
  const connectingEdge = useContextSelector(WorkflowActionsContext, (v) => v.connectingEdge);

  const { showSourceHandle, RightHandle } = useMemo(() => {
    const node = getNodeById(nodeId);

    /* not node/not connecting node, hidden */
    const showSourceHandle = (() => {
      if (!node) return false;
      if (connectingEdge && connectingEdge.nodeId !== nodeId) return false;
      return true;
    })();

    const RightHandle = (() => {
      const handleId = getHandleId(nodeId, sourceType, Position.Right);
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
        !(node?.isFolded && node?.outputs.length) &&
        (!node || !node?.showSourceHandle || rightTargetConnected)
      )
        return null;

      return (
        <MySourceHandle
          nodeId={nodeId}
          handleId={handleId}
          position={Position.Right}
          translate={[4, 0]}
        />
      );
    })();

    return {
      showSourceHandle,
      RightHandle
    };
  }, [getNodeById, nodeId, connectingEdge, sourceType, edges]);

  return showSourceHandle ? <>{RightHandle}</> : null;
};

export const ConnectionTargetHandle = React.memo(function ConnectionTargetHandle({
  nodeId
}: {
  nodeId: string;
}) {
  const edges = useContextSelector(WorkflowBufferDataContext, (v) => v.edges);
  const getNodeById = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodeById);
  const connectingEdge = useContextSelector(WorkflowActionsContext, (v) => v.connectingEdge);

  const { LeftHandle } = useMemo(() => {
    const node = getNodeById(nodeId);
    const connectingNode = getNodeById(connectingEdge?.nodeId);

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
      if (!node || !node?.showTargetHandle) return null;

      const handleId = getHandleId(nodeId, 'target', Position.Left);

      return (
        <MyTargetHandle
          nodeId={nodeId}
          handleId={handleId}
          position={Position.Left}
          translate={[-4, 0]}
          showHandle={showHandle}
        />
      );
    })();

    return {
      showHandle,
      LeftHandle
    };
  }, [connectingEdge, edges, nodeId, getNodeById]);

  return <>{LeftHandle}</>;
});

export default function Dom() {
  return <></>;
}
