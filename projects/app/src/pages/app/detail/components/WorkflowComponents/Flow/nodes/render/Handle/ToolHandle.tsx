import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { Box, BoxProps } from '@chakra-ui/react';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import { Connection, Handle, Position } from 'reactflow';
import { useCallback, useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
import { WorkflowNodeEdgeContext } from '../../../../context/workflowInitContext';

const handleSize = '16px';

type ToolHandleProps = BoxProps & {
  nodeId: string;
  show: boolean;
};
export const ToolTargetHandle = ({ show, nodeId }: ToolHandleProps) => {
  const { t } = useTranslation();
  const connectingEdge = useContextSelector(WorkflowContext, (ctx) => ctx.connectingEdge);
  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);

  const handleId = NodeOutputKeyEnum.selectedTools;

  const connected = edges.some((edge) => edge.target === nodeId && edge.targetHandle === handleId);

  // if top handle is connected, return null
  const showHandle = connectingEdge
    ? show && connectingEdge.handleId === NodeOutputKeyEnum.selectedTools
    : connected;

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
          ...(showHandle ? {} : { visibility: 'hidden' })
        }}
        type="target"
        id={handleId}
        position={Position.Top}
        isConnectableEnd={showHandle}
      >
        <Box
          className="flow-handle"
          w={handleSize}
          h={handleSize}
          border={'4px solid #8774EE'}
          rounded={'xs'}
          bg={'white'}
          transform={'translate(0,0) rotate(45deg)'}
          pointerEvents={'none'}
        />
      </Handle>
    );
  }, [handleId, showHandle]);

  return Render;
};

export const ToolSourceHandle = () => {
  const { t } = useTranslation();
  const setEdges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.setEdges);

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
            bottom: '-10px'
          }}
          type="source"
          id={NodeOutputKeyEnum.selectedTools}
          position={Position.Bottom}
          onConnect={onConnect}
        >
          <Box
            w={handleSize}
            h={handleSize}
            border={'4px solid #8774EE'}
            rounded={'xs'}
            bg={'white'}
            transform={'translate(0,0) rotate(45deg)'}
            pointerEvents={'none'}
          />
        </Handle>
      </MyTooltip>
    );
  }, [onConnect, t]);

  return Render;
};

export default function Dom() {
  return <></>;
}
