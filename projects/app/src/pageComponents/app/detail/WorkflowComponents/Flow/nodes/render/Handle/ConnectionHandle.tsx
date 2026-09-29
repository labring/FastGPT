import React, { useCallback, useMemo } from 'react';
import { Position, useConnection, useEdges, useReactFlow, type Node } from '@xyflow/react';
import { MySourceHandle, MyTargetHandle } from '.';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { isNodeConnectionAllowed } from '@fastgpt/global/core/workflow/template/context';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { getIfElseBranchHandleKey } from '@fastgpt/global/core/workflow/template/system/ifElse/utils';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';

export const ConnectionSourceHandle = ({
  nodeId,
  sourceType = 'source'
}: {
  nodeId: string;
  sourceType?: 'source' | 'source_catch';
}) => {
  const { getNode } = useReactFlow<Node<FlowNodeItemType>>();
  const edges = useEdges();
  const connection = useConnection();
  const connectingNodeId = connection.inProgress ? connection.fromNode?.id : undefined;

  const { showSourceHandle, RightHandle } = useMemo(() => {
    const node = getNode(nodeId)?.data;

    /* not node/not connecting node, hidden */
    const showSourceHandle = (() => {
      if (!node) return false;
      if (connectingNodeId && connectingNodeId !== nodeId) return false;
      return true;
    })();

    const RightHandle = (() => {
      // When the node is folded and has multiple branches, only render the first output.
      if (node?.isFolded) {
        const firstHandleId = (() => {
          if (node.flowNodeType === FlowNodeTypeEnum.userSelect) {
            const options = node?.inputs?.find(
              (input) => input.key === NodeInputKeyEnum.userSelectOptions
            )?.value;
            if (options && options.length > 0) {
              return getHandleId(nodeId, 'source', options[0].key);
            }
          } else if (node.flowNodeType === FlowNodeTypeEnum.ifElseNode) {
            const ifElseList = node.inputs.find(
              (input) => input.key === NodeInputKeyEnum.ifElseList
            )?.value as IfElseListItemType[] | undefined;
            const firstIfElse = ifElseList?.[0];
            if (firstIfElse) {
              return getHandleId(nodeId, 'source', getIfElseBranchHandleKey(firstIfElse));
            }
          } else if (node.flowNodeType === FlowNodeTypeEnum.classifyQuestion) {
            const options = node?.inputs?.find(
              (input) => input.key === NodeInputKeyEnum.agents
            )?.value;
            if (options && options.length > 0) {
              return getHandleId(nodeId, 'source', options[0].key);
            }
          }
        })();

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

      const handleId = getHandleId(nodeId, sourceType, Position.Right);
      const rightTargetConnected = edges.some(
        (edge) => edge.targetHandle === getHandleId(nodeId, 'target', Position.Right)
      );

      if (!node || !node?.showSourceHandle || rightTargetConnected) {
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
      showSourceHandle,
      RightHandle
    };
  }, [getNode, nodeId, connectingNodeId, sourceType, edges]);

  return showSourceHandle ? <>{RightHandle}</> : null;
};

export const ConnectionTargetHandle = React.memo(function ConnectionTargetHandle({
  nodeId
}: {
  nodeId: string;
}) {
  const { getNode } = useReactFlow<Node<FlowNodeItemType>>();
  const edges = useEdges();
  const connection = useConnection();
  const connectingNodeId = connection.inProgress ? connection.fromNode?.id : undefined;
  const connectingHandleId = connection.inProgress ? connection.fromHandle?.id : undefined;

  const getNodeById = useCallback(
    (id: string | null | undefined) => (id ? getNode(id)?.data : undefined),
    [getNode]
  );

  const { LeftHandle } = useMemo(() => {
    const node = getNode(nodeId)?.data;
    const connectingNode = connectingNodeId ? getNode(connectingNodeId)?.data : undefined;

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
          connectingHandleId &&
          connectingHandleId === edge.sourceHandle &&
          edge.target === nodeId
        ) {
          forbidConnect = true;
        }
      }
    }

    // 目标节点容器或模板上下文不允许时禁止连接（与 Tool 柄及最终提交共用规则）
    const sourceNode = connectingNodeId ? getNodeById(connectingNodeId) : undefined;
    const targetTemplate = node
      ? moduleTemplatesFlat.find((item) => item.id === node.flowNodeType)
      : undefined;
    if (node && sourceNode && connectingHandleId) {
      if (
        !isNodeConnectionAllowed({
          targetTemplate,
          targetNode: node,
          sourceNode,
          edges,
          handleId: connectingHandleId,
          getNodeById
        })
      ) {
        forbidConnect = true;
      }
    }

    const showHandle = (() => {
      if (forbidConnect) return false;
      if (!node) return false;

      // Tool connecting
      if (connectingHandleId === NodeOutputKeyEnum.selectedTools) return false;

      // Unable to connect oneself
      if (connectingNodeId === nodeId) return false;
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
  }, [connectingHandleId, connectingNodeId, edges, nodeId, getNodeById, getNode]);

  return <>{LeftHandle}</>;
});

export default function Dom() {
  return <></>;
}
