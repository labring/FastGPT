import React, { useMemo } from 'react';
import { Position } from 'reactflow';
import { MySourceHandle, MyTargetHandle } from '.';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../../context';
import { WorkflowNodeEdgeContext } from '../../../../context/workflowInitContext';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';

export const ConnectionSourceHandle = ({
  nodeId,
  isFoldNode
}: {
  nodeId: string;
  isFoldNode?: boolean;
}) => {
  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);
  const { connectingEdge, nodeList } = useContextSelector(WorkflowContext, (ctx) => ctx);

  const { showSourceHandle, RightHandle } = useMemo(() => {
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
  }, [connectingEdge, edges, nodeId, nodeList, isFoldNode]);

  return showSourceHandle ? <>{RightHandle}</> : null;
};

export const ConnectionTargetHandle = React.memo(function ConnectionTargetHandle({
  nodeId
}: {
  nodeId: string;
}) {
  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);
  const { connectingEdge, nodeList } = useContextSelector(WorkflowContext, (ctx) => ctx);

  const { LeftHandle } = useMemo(() => {
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
  }, [connectingEdge, edges, nodeId, nodeList]);

  return <>{LeftHandle}</>;
});

export default function Dom() {
  return <></>;
}
