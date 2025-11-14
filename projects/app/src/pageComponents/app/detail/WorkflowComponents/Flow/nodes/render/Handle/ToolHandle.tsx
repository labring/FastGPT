import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { Box, type BoxProps } from '@chakra-ui/react';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import { type Connection, Handle, Position } from 'reactflow';
import { useCallback, useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../../../context/workflowInitContext';
import { WorkflowActionsContext } from '../../../../context/workflowActionsContext';
import { WorkflowUIContext } from '../../../../context/workflowUIContext';

const handleSize = '16px';
const activeHandleSize = '20px';
const handleId = NodeOutputKeyEnum.selectedTools;

type ToolHandleProps = BoxProps & {
  nodeId: string;
  show: boolean;
};
export const ToolTargetHandle = ({ show, nodeId }: ToolHandleProps) => {
  const toolConnecting = useContextSelector(
    WorkflowActionsContext,
    (ctx) => ctx.connectingEdge?.handleId === NodeOutputKeyEnum.selectedTools
  );
  const connected = useContextSelector(WorkflowBufferDataContext, (v) =>
    v.edges.some((edge) => edge.target === nodeId && edge.targetHandle === handleId)
  );

  const active = show && toolConnecting;
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
          top: '-10px',
          ...(showHandle ? {} : { visibility: 'hidden' })
        }}
        type="target"
        id={handleId}
        position={Position.Top}
        isConnectableEnd={showHandle}
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
  }, [showHandle, size]);

  return Render;
};

export const ToolSourceHandle = ({ nodeId }: { nodeId: string }) => {
  const { t } = useTranslation();
  const setEdges = useContextSelector(WorkflowBufferDataContext, (v) => v.setEdges);
  const connectingEdge = useContextSelector(
    WorkflowActionsContext,
    (ctx) => ctx.connectingEdge?.nodeId === nodeId
  );
  const nodeIsHover = useContextSelector(WorkflowUIContext, (v) => v.hoverNodeId === nodeId);

  const active = useMemo(() => nodeIsHover || connectingEdge, [nodeIsHover, connectingEdge]);

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
            bottom: '-10px'
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
  }, [onConnect, size, t]);

  return Render;
};

export default function Dom() {
  return <></>;
}
