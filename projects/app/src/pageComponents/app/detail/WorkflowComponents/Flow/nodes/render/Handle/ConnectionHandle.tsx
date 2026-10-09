import React, { useMemo } from 'react';
import {
  Position,
  useConnection,
  useNodeConnections,
  useReactFlow,
  type Node
} from '@xyflow/react';
import { MySourceHandle, MyTargetHandle } from '.';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getNodeOutputHandleDescriptors } from '@/web/core/workflow/utils';

export const ConnectionSourceHandle = React.memo(function ConnectionSourceHandle({
  nodeId,
  showSourceHandle = true,
  isFolded,
  flowNodeType,
  inputs,
  sourceType = 'source'
}: {
  nodeId: string;
  showSourceHandle?: boolean;
  isFolded?: boolean;
  flowNodeType?: FlowNodeTypeEnum;
  inputs?: FlowNodeItemType['inputs'];
  sourceType?: 'source' | 'source_catch';
}) {
  const connection = useConnection();
  const connectingNodeId = connection.inProgress ? connection.fromNode?.id : undefined;

  // Fine-grained subscription: only re-render if the right target handle connection changes
  const rightTargetConnections = useNodeConnections({
    id: nodeId,
    handleType: 'target',
    handleId: getHandleId(nodeId, 'target', Position.Right)
  });
  const rightTargetConnected = rightTargetConnections.length > 0;

  const { isShow, RightHandle } = useMemo(() => {
    /* not connecting node, hidden */
    const isShow = (() => {
      if (!showSourceHandle) return false;
      if (connectingNodeId && connectingNodeId !== nodeId) return false;
      return true;
    })();

    const RightHandle = (() => {
      // When the node is folded and has multiple branches, only render the first output.
      if (isFolded && flowNodeType) {
        const isBranchNode =
          flowNodeType === FlowNodeTypeEnum.userSelect ||
          flowNodeType === FlowNodeTypeEnum.ifElseNode ||
          flowNodeType === FlowNodeTypeEnum.classifyQuestion;

        if (isBranchNode) {
          const branchHandles = getNodeOutputHandleDescriptors({
            nodeId,
            flowNodeType,
            inputs
          });
          const firstHandleId = branchHandles[0]?.id;

          if (firstHandleId) {
            return (
              <MySourceHandle
                nodeId={nodeId}
                handleId={firstHandleId}
                position={Position.Right}
                translate={[4, 0]}
              />
            );
          }
        }
      }

      const handleId = getHandleId(nodeId, sourceType, Position.Right);

      if (!showSourceHandle || rightTargetConnected) {
        return null;
      }

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
      isShow,
      RightHandle
    };
  }, [
    showSourceHandle,
    connectingNodeId,
    nodeId,
    isFolded,
    flowNodeType,
    inputs,
    sourceType,
    rightTargetConnected
  ]);

  return isShow ? <>{RightHandle}</> : null;
});

export const ConnectionTargetHandle = React.memo(function ConnectionTargetHandle({
  nodeId,
  showTargetHandle = true,
  parentNodeId
}: {
  nodeId: string;
  showTargetHandle?: boolean;
  parentNodeId?: string;
}) {
  const { getNode } = useReactFlow<Node<FlowNodeItemType>>();
  const connection = useConnection();
  const connectingNodeId = connection.inProgress ? connection.fromNode?.id : undefined;
  const connectingHandleId = connection.inProgress ? connection.fromHandle?.id : undefined;

  const targetHandleId = getHandleId(nodeId, 'target', Position.Left);

  // Fine-grained subscriptions: only re-render when tool or target connections change
  const toolConnections = useNodeConnections({
    id: nodeId,
    handleType: 'target',
    handleId: NodeOutputKeyEnum.selectedTools
  });
  const targetConnections = useNodeConnections({
    id: nodeId,
    handleType: 'target',
    handleId: targetHandleId
  });

  const LeftHandle = useMemo(() => {
    if (!showTargetHandle) return null;

    let forbidConnect = false;

    // Node has connected tool, it cannot be connected by other handle
    if (toolConnections.length > 0) {
      forbidConnect = true;
    }

    // The same source handle cannot connect to the same target node
    if (
      connectingHandleId &&
      connectingNodeId &&
      targetConnections.some(
        (c) => c.source === connectingNodeId && c.sourceHandle === connectingHandleId
      )
    ) {
      forbidConnect = true;
    }

    const connectingNode = connectingNodeId ? getNode(connectingNodeId)?.data : undefined;

    const showHandle = (() => {
      if (forbidConnect) return false;

      // Tool connecting
      if (connectingHandleId === NodeOutputKeyEnum.selectedTools) return false;

      // Unable to connect oneself
      if (connectingNodeId === nodeId) return false;
      // Not the same parent node
      if (connectingNode && (connectingNode.parentNodeId || '') !== (parentNodeId || ''))
        return false;

      return true;
    })();

    return (
      <MyTargetHandle
        nodeId={nodeId}
        handleId={targetHandleId}
        position={Position.Left}
        translate={[-4, 0]}
        showHandle={showHandle}
      />
    );
  }, [
    showTargetHandle,
    toolConnections.length,
    connectingHandleId,
    connectingNodeId,
    targetConnections,
    getNode,
    nodeId,
    targetHandleId,
    parentNodeId
  ]);

  return <>{LeftHandle}</>;
});

export default function Dom() {
  return <></>;
}
