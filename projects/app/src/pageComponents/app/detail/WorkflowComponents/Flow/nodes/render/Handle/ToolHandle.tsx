import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { Box, type BoxProps } from '@chakra-ui/react';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import {
  type Connection,
  Handle,
  Position,
  useConnection,
  useEdges,
  useHandleConnections,
  useReactFlow,
  type Node,
  type Edge
} from '@xyflow/react';
import { useCallback, useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowUIContext } from '../../../../context/workflowUIContext';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { isNodeConnectionAllowed } from '@fastgpt/global/core/workflow/template/context';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';

const handleSize = '20px';
const activeHandleSize = '24px';
const handleId = NodeOutputKeyEnum.selectedTools;

type ToolHandleProps = BoxProps & {
  nodeId: string;
  show: boolean;
};
export const ToolTargetHandle = ({ show, nodeId }: ToolHandleProps) => {
  const connection = useConnection();
  const connectingHandleId = connection.inProgress ? connection.fromHandle?.id : undefined;
  const connectingNodeId = connection.inProgress ? connection.fromNode?.id : undefined;

  const { getNode } = useReactFlow<Node<FlowNodeItemType>>();
  const edges = useEdges();
  const toolConnections = useHandleConnections({ type: 'target', id: handleId });
  const connected = toolConnections.length > 0;

  const active = useMemo(() => {
    if (!show || connectingHandleId !== handleId || !connectingNodeId) return false;

    const sourceNode = getNode(connectingNodeId)?.data;
    const targetNode = getNode(nodeId)?.data;
    const targetTemplate = targetNode
      ? moduleTemplatesFlat.find((item) => item.id === targetNode.flowNodeType)
      : undefined;

    return (
      !!sourceNode &&
      !!targetNode &&
      isNodeConnectionAllowed({
        targetTemplate,
        targetNode,
        sourceNode,
        edges,
        handleId: connectingHandleId,
        getNodeById: (id) => (id ? getNode(id)?.data : undefined)
      })
    );
  }, [connectingHandleId, connectingNodeId, edges, getNode, nodeId, show]);
  // if top handle is connected, return null
  const showHandle = active || connected;

  const size = active ? activeHandleSize : handleSize;

  const Render = useMemo(() => {
    return (
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
          top: active ? '-14px' : '-10px',
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
          transform={'translate(0,0) rotate(45deg)'}
          pointerEvents={'none'}
        />
      </Handle>
    );
  }, [active, showHandle, size]);

  return Render;
};

export const ToolSourceHandle = ({ nodeId }: { nodeId: string }) => {
  const { t } = useTranslation();
  const { setEdges } = useReactFlow<Node<FlowNodeItemType>, Edge>();
  const connection = useConnection();
  const isConnectingFromThisNode = connection.inProgress && connection.fromNode?.id === nodeId;
  const nodeIsHover = useContextSelector(WorkflowUIContext, (v) => v.hoverNodeId === nodeId);

  const active = useMemo(
    () => nodeIsHover || isConnectingFromThisNode,
    [nodeIsHover, isConnectingFromThisNode]
  );

  /* onConnect edge, delete tool input and switch */
  const onConnect = useCallback(
    (e: Connection) => {
      setEdges((edges) =>
        edges.filter((edge) => {
          if (edge.target !== e.target) return true;
          if (edge.targetHandle === NodeOutputKeyEnum.selectedTools) return true;
          return false;
        })
      );
    },
    [setEdges]
  );

  const size = active ? activeHandleSize : handleSize;

  const Render = useMemo(() => {
    return (
      <MyTooltip label={t('common:core.workflow.tool.Handle')} shouldWrapChildren={false}>
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
            bottom: active ? '-14px' : '-10px',
            zIndex: 30
          }}
          type="source"
          id={NodeOutputKeyEnum.selectedTools}
          position={Position.Bottom}
          onConnect={onConnect}
        >
          <Box
            w={size}
            h={size}
            border={'4px solid #8774EE'}
            rounded={'xs'}
            bg={'white'}
            transform={'translate(0,0) rotate(45deg)'}
            pointerEvents={'none'}
          />
        </Handle>
      </MyTooltip>
    );
  }, [active, onConnect, size, t]);

  return Render;
};

export default function Dom() {
  return <></>;
}
