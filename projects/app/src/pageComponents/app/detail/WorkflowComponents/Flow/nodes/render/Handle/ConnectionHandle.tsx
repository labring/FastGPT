import React, { useMemo } from 'react';
import { Position } from 'reactflow';
import { MySourceHandle, MyTargetHandle } from '.';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { isNodeConnectionAllowed } from '@fastgpt/global/core/workflow/template/context';
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

    // 目标节点容器或模板上下文不允许时禁止连接（与 Tool 柄及最终提交共用规则）
    const sourceNode = connectingEdge ? getNodeById(connectingEdge.nodeId) : undefined;
    const targetTemplate = node
      ? moduleTemplatesFlat.find((item) => item.id === node.flowNodeType)
      : undefined;
    if (node && sourceNode && connectingEdge) {
      if (
        !isNodeConnectionAllowed({
          targetTemplate,
          targetNode: node,
          sourceNode,
          edges,
          handleId: connectingEdge.handleId,
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
