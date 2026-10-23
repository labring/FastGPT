import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { Box, type BoxProps } from '@chakra-ui/react';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import { Handle, Position } from 'reactflow';
import React, { useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../../../context/workflowInitContext';
import { WorkflowActionsContext } from '../../../../context/workflowActionsContext';
import { WorkflowUIContext } from '../../../../context/workflowUIContext';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { isNodeConnectionAllowed } from '@fastgpt/global/core/workflow/template/context';

const handleSize = '20px';
const activeHandleSize = '24px';
const handleId = NodeOutputKeyEnum.selectedTools;

type ToolHandleProps = BoxProps & {
  nodeId: string;
  show: boolean;
};
export const ToolTargetHandle = ({ show, nodeId }: ToolHandleProps) => {
  const connectingEdge = useContextSelector(WorkflowActionsContext, (ctx) => ctx.connectingEdge);
  const edges = useContextSelector(WorkflowBufferDataContext, (v) => v.edges);
  const getNodeById = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodeById);
  const connected = useContextSelector(WorkflowBufferDataContext, (v) =>
    v.edges.some((edge) => edge.target === nodeId && edge.targetHandle === handleId)
  );

  const active = useMemo(() => {
    if (!show || connectingEdge?.handleId !== handleId) return false;
    if (connectingEdge.nodeId === nodeId) return false;

    const sourceNode = getNodeById(connectingEdge.nodeId);
    const targetNode = getNodeById(nodeId);
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
        handleId: connectingEdge.handleId,
        getNodeById
      })
    );
  }, [connectingEdge, edges, getNodeById, nodeId, show]);
  // 隐藏图形时仍保留端口，保证已有工具连线始终能找到端点。
  const showHandle = active || connected;

  const size = active ? activeHandleSize : handleSize;

  const Render = useMemo(() => {
    return (
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
          top: '-10px',
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
          flexShrink={0}
        />
      </Handle>
    );
  }, [active, showHandle, size]);

  return Render;
};

export const ToolSourceHandle = ({ nodeId }: { nodeId: string }) => {
  const { t } = useTranslation();
  const connectingEdge = useContextSelector(WorkflowActionsContext, (ctx) => ctx.connectingEdge);
  const nodeIsHover = useContextSelector(WorkflowUIContext, (v) => v.hoverNodeId === nodeId);

  const active = useMemo(
    () => nodeIsHover || connectingEdge?.nodeId === nodeId,
    [connectingEdge, nodeId, nodeIsHover]
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
            width: handleSize,
            height: handleSize,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bottom: '-10px',
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
            transform={'translate(0,0) rotate(45deg)'}
            pointerEvents={'none'}
            flexShrink={0}
          />
        </Handle>
      </MyTooltip>
    );
  }, [size, t]);

  return Render;
};

export default function Dom() {
  return <></>;
}
