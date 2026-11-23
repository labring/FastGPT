import React, { useContext, useMemo } from 'react';
import { Position } from '@xyflow/react';
import { MySourceHandle, MyTargetHandle } from '.';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';
import { getWorkflowConnectionError } from '@/web/core/workflow/editor/codec';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { useNode } from '@/web/core/workflow/editor/react/useNode';
import { useWorkflow } from '@/web/core/workflow/editor/react/useWorkflow';
import { useWorkflowRuntime } from '@/web/core/workflow/editor/session/workflowSession';
import { useWorkflowUIValue } from '../../../canvas/canvasState';
import { WorkflowHandleRenderContext } from './handleRenderContext';
import { getNodeShellHandleAnchor, type NodeShellHandleModel } from '../../../utils/nodeHandle';

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
  const nodeType = useNode(nodeId, (handle) => handle?.data.flowNodeType);
  // 保留真实端口供离屏节点进入视口时测量；拖线时由 MySourceHandle 隐藏外观。
  const showSourceHandle = moduleTemplatesFlat.find(
    (template) => template.flowNodeType === nodeType
  )?.showSourceHandle;
  if (!renderHandle || !showSourceHandle) return null;
  return (
    <MySourceHandle
      nodeId={nodeId}
      handleId={getHandleId(nodeId, sourceType, Position.Right)}
      position={Position.Right}
      translate={sourceTranslate}
    />
  );
};

/** shell 保留实际 source ID；折叠时只有首个可用端口作为交互入口。 */
export const NodeShellSourceHandles = ({
  nodeId,
  model,
  isFolded,
  centers
}: {
  nodeId: string;
  model: NodeShellHandleModel;
  isFolded: boolean;
  centers?: ReadonlyMap<string, { x: number; y: number }>;
}) => (
  <>
    {model.showDefaultSource && <ConnectionSourceHandle nodeId={nodeId} />}
    {model.sourceHandles.map(({ handleId, translate }, index) => {
      const anchor = getNodeShellHandleAnchor({ isFolded, center: centers?.get(handleId) });
      return (
        <MySourceHandle
          key={handleId}
          nodeId={nodeId}
          handleId={handleId}
          position={Position.Right}
          translate={anchor ? undefined : translate}
          anchor={anchor}
          showHandle={!isFolded || (!model.showDefaultSource && index === 0)}
        />
      );
    })}
  </>
);

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
    if (!runtime || !connectingEdge.nodeId || !connectingEdge.handleId) return false;

    return !getWorkflowConnectionError({
      connection: {
        source: connectingEdge.nodeId,
        sourceHandle: connectingEdge.handleId,
        target: nodeId,
        targetHandle: handleId
      },
      edges,
      getNodeById: (id) =>
        id === nodeId ? targetNode : id === connectingEdge.nodeId ? sourceNode : runtime.getNode(id)
    });
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
