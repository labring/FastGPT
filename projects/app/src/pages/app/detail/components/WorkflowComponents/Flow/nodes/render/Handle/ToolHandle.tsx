import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { Box, BoxProps } from '@chakra-ui/react';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import { Connection, Handle, Position } from 'reactflow';
import { useCallback, useMemo } from 'react';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
const handleSize = '14px';

type ToolHandleProps = BoxProps & {
  nodeId: string;
};
export const ToolTargetHandle = ({ nodeId }: ToolHandleProps) => {
  const { t } = useTranslation();
  const connectingEdge = useContextSelector(WorkflowContext, (ctx) => ctx.connectingEdge);
  const edges = useContextSelector(WorkflowContext, (v) => v.edges);

  const handleId = NodeOutputKeyEnum.selectedTools;

  const connected = edges.some((edge) => edge.target === nodeId && edge.targetHandle === handleId);

  // if top handle is connected, return null
  const hidden =
    !connected &&
    (connectingEdge?.handleId !== NodeOutputKeyEnum.selectedTools ||
      edges.some((edge) => edge.targetHandle === getHandleId(nodeId, 'target', 'top')));

  const Render = useMemo(() => {
    return hidden ? null : (
      <MyTooltip label={t('core.workflow.tool.Handle')} shouldWrapChildren={false}>
        <Handle
          style={{
            borderRadius: '0',
            backgroundColor: 'transparent',
            border: 'none',
            width: handleSize,
            height: handleSize
          }}
          type="target"
          id={handleId}
          position={Position.Top}
        >
          <Box
            className="flow-handle"
            w={handleSize}
            h={handleSize}
            border={'4px solid #8774EE'}
            transform={'translate(0,-30%) rotate(45deg)'}
            pointerEvents={'none'}
            visibility={'visible'}
          />
        </Handle>
      </MyTooltip>
    );
  }, [handleId, hidden, t]);

  return Render;
};

export const ToolSourceHandle = ({ nodeId }: ToolHandleProps) => {
  const { t } = useTranslation();
  const setEdges = useContextSelector(WorkflowContext, (v) => v.setEdges);

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
      <MyTooltip label={t('core.workflow.tool.Handle')} shouldWrapChildren={false}>
        <Handle
          style={{
            borderRadius: '0',
            backgroundColor: 'transparent',
            border: 'none',
            width: handleSize,
            height: handleSize
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
            transform={'translate(0,30%) rotate(45deg)'}
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
