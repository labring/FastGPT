import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { Box, type BoxProps } from '@chakra-ui/react';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getWorkflowConnectionError } from '@/web/core/workflow/editor/codec';
import { useNode } from '@/web/core/workflow/editor/react/useNode';
import { useTranslation } from 'next-i18next';
import { Handle, Position } from '@xyflow/react';
import { useContext, useMemo } from 'react';
import { useWorkflowUIValue } from '../../../canvas/canvasState';
import { useWorkflow } from '@/web/core/workflow/editor/react/useWorkflow';
import { useWorkflowRuntime } from '@/web/core/workflow/editor/session/workflowSession';
import { WorkflowHandleRenderContext } from './handleRenderContext';

const handleSize = '20px';
const activeHandleSize = '24px';
const handleId = NodeOutputKeyEnum.selectedTools;

type ToolHandleProps = BoxProps & {
  nodeId: string;
  show: boolean;
};

export const ToolTargetHandle = ({ show, nodeId }: ToolHandleProps) => {
  const renderHandle = useContext(WorkflowHandleRenderContext);
  const runtime = useWorkflowRuntime();
  const connectingEdge = useWorkflowUIValue((ctx) => ctx.connectingEdge);
  const connected = useWorkflow((_structure, graph) => graph.isMountedTool(nodeId));
  const edges = useWorkflow((structure) => structure.edges);
  const sourceNode = useNode(connectingEdge?.nodeId ?? nodeId, (node) => node?.data);
  const targetNode = useNode(nodeId, (node) => node?.data);

  const active = useMemo(() => {
    if (!show || !runtime || connectingEdge?.handleId !== handleId || !connectingEdge.nodeId)
      return false;

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
  }, [connectingEdge, edges, nodeId, runtime, show, sourceNode, targetNode]);
  const showHandle = connectingEdge ? active : connected;
  const size = active ? activeHandleSize : handleSize;

  const Render = useMemo(
    () => (
      <Handle
        style={{
          borderRadius: '0',
          backgroundColor: 'transparent',
          border: 'none',
          width: handleSize,
          height: handleSize,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 30,
          ...(showHandle ? {} : { visibility: 'hidden' })
        }}
        type="target"
        id={handleId}
        position={Position.Top}
        isConnectableEnd={active}
        isConnectableStart={false}
      >
        <Box
          className="flow-handle"
          w={size}
          h={size}
          border={'4px solid #8774EE'}
          rounded={'xs'}
          bg={'white'}
          transform={'rotate(45deg)'}
          pointerEvents={'none'}
          flexShrink={0}
        />
      </Handle>
    ),
    [active, showHandle, size]
  );

  return renderHandle ? Render : null;
};

export const ToolSourceHandle = ({ nodeId }: { nodeId: string }) => {
  const renderHandle = useContext(WorkflowHandleRenderContext);
  const { t } = useTranslation();
  const connectingEdge = useWorkflowUIValue((ctx) => ctx.connectingEdge?.nodeId === nodeId);
  const nodeIsHover = useWorkflowUIValue((ctx) => ctx.hoverNodeId === nodeId);
  const active = useMemo(() => nodeIsHover || connectingEdge, [connectingEdge, nodeIsHover]);
  const size = active ? activeHandleSize : handleSize;

  const Render = useMemo(
    () => (
      <MyTooltip label={t('common:core.workflow.tool.Handle')} shouldWrapChildren={false}>
        <Box position="absolute" left="50%" bottom={0} w="0px" h="0px">
          <Handle
            style={{
              borderRadius: '0',
              backgroundColor: 'transparent',
              border: 'none',
              width: size,
              height: size,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 30
            }}
            type="source"
            id={NodeOutputKeyEnum.selectedTools}
            position={Position.Bottom}
            isConnectableEnd={false}
          >
            <Box
              w={size}
              h={size}
              border={'4px solid #8774EE'}
              rounded={'xs'}
              bg={'white'}
              transform={'rotate(45deg)'}
              pointerEvents={'none'}
              flexShrink={0}
            />
          </Handle>
        </Box>
      </MyTooltip>
    ),
    [size, t]
  );

  return renderHandle ? Render : null;
};
