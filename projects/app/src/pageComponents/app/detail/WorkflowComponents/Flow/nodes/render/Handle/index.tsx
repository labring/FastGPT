import React, { useMemo } from 'react';
import { Handle, Position, useViewport } from 'reactflow';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../../context';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  WorkflowNodeEdgeContext,
  WorkflowInitContext
} from '../../../../context/workflowInitContext';
import { WorkflowEventContext } from '../../../../context/workflowEventContext';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'react-i18next';
import { Box, Flex } from '@chakra-ui/react';

const handleSize = 20;
const handleSizeConnected = 16;

const sourceCommonStyle = {
  backgroundColor: 'white',
  borderWidth: '3px',
  borderRadius: '50%'
};

const handleConnectedStyle = {
  ...sourceCommonStyle,
  borderColor: '#94B5FF',
  width: handleSizeConnected,
  height: handleSizeConnected
};

const handleHighLightStyle = {
  ...sourceCommonStyle,
  borderColor: '#487FFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: handleSize,
  height: handleSize
};

type Props = {
  nodeId: string;
  handleId: string;
  position: Position;
  translate?: [number, number];
};

export const MySourceHandle = React.memo(function MySourceHandle({
  nodeId,
  translate,
  handleId,
  position
}: Props) {
  const { t } = useTranslation();

  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);
  const connectingEdge = useContextSelector(WorkflowContext, (ctx) => ctx.connectingEdge);
  const node = useContextSelector(WorkflowInitContext, (v) =>
    v.nodes.find((node) => node.data.nodeId === nodeId)
  );
  const hoverNodeId = useContextSelector(WorkflowEventContext, (v) => v.hoverNodeId);

  const connected = edges.some((edge) => edge.sourceHandle === handleId);
  const nodeFolded = node?.data.isFolded && edges.some((edge) => edge.source === nodeId);
  const nodeIsHover = hoverNodeId === nodeId;
  const active = useMemo(
    () => nodeIsHover || node?.selected || connectingEdge?.handleId === handleId,
    [nodeIsHover, node?.selected, connectingEdge, handleId]
  );

  const { zoom } = useViewport();

  const sourceScale = Number(Math.min(Math.max(1 / zoom, 1), 4).toFixed(1));
  const targetScale = Number(Math.min(Math.max(1 / zoom, 1), 2).toFixed(1));
  const translateStr = useMemo(() => {
    if (!translate) return '';
    if (position === Position.Right) {
      return `${active ? translate[0] + 2 : translate[0]}px, -50%`;
    }
  }, [active, position, translate]);

  const { styles, showAddIcon } = useMemo(() => {
    if (active) {
      return {
        styles: {
          ...handleHighLightStyle,
          transform: `${translateStr ? `translate(${translateStr})` : ''}`,
          width: handleSize * sourceScale,
          height: handleSize * sourceScale
        },
        showAddIcon: true
      };
    }

    if (connected || nodeFolded) {
      return {
        styles: {
          ...handleConnectedStyle,
          transform: `${translateStr ? `translate(${translateStr})` : ''}`,
          width: handleSizeConnected * targetScale,
          height: handleSizeConnected * targetScale
        },
        showAddIcon: false
      };
    }

    return {
      styles: {
        visibility: 'hidden' as const
      },
      showAddIcon: false
    };
  }, [active, connected, nodeFolded, translateStr, sourceScale, targetScale]);

  if (!node) return null;
  if (connectingEdge?.handleId === NodeOutputKeyEnum.selectedTools) return null;

  return (
    <MyTooltip
      label={
        <Box>
          <Flex>
            <Box color={'myGray.900'}>{t('workflow:Click')}</Box>
            <Box color={'myGray.600'}>{t('workflow:to_add_node')}</Box>
          </Flex>
          <Flex>
            <Box color={'myGray.900'}>{t('workflow:Drag')}</Box>
            <Box color={'myGray.600'}>{t('workflow:to_connect_node')}</Box>
          </Flex>
        </Box>
      }
      shouldWrapChildren={false}
    >
      <Handle
        style={styles}
        type="source"
        id={handleId}
        position={position}
        isConnectableEnd={false}
      >
        {showAddIcon && (
          <MyIcon
            name={sourceScale > 1.3 ? 'common/add2' : 'edgeAdd'}
            color={'primary.500'}
            pointerEvents={'none'}
            w={`${16 * sourceScale}px`}
            h={`${16 * sourceScale}px`}
          />
        )}
      </Handle>
    </MyTooltip>
  );
});

export const MyTargetHandle = React.memo(function MyTargetHandle({
  nodeId,
  handleId,
  position,
  translate,
  showHandle
}: Props & {
  showHandle: boolean;
}) {
  const connected = useContextSelector(WorkflowNodeEdgeContext, (v) =>
    v.edges.some((edge) => edge.targetHandle === handleId)
  );
  const connectingEdge = useContextSelector(WorkflowContext, (ctx) => ctx.connectingEdge);

  const { zoom } = useViewport();
  const sourceScale = Number(Math.min(Math.max(1 / zoom, 1), 4).toFixed(1));
  const targetScale = Number(Math.min(Math.max(1 / zoom, 1), 2).toFixed(1));
  const translateStr = useMemo(() => {
    if (!translate) return '';

    if (position === Position.Left) {
      return `${connectingEdge ? translate[0] - 2 : translate[0]}px, -50%`;
    }
  }, [connectingEdge, position, translate]);

  const styles = useMemo(() => {
    if ((!connectingEdge && !connected) || !showHandle) {
      return {
        visibility: 'hidden' as const
      };
    }

    if (connectingEdge) {
      return {
        ...handleHighLightStyle,
        transform: `${translateStr ? `translate(${translateStr})` : ''}`,
        width: handleSize * sourceScale,
        height: handleSize * sourceScale
      };
    }

    if (connected) {
      return {
        ...handleConnectedStyle,
        transform: `${translateStr ? `translate(${translateStr})` : ''}`,
        width: handleSizeConnected * targetScale,
        height: handleSizeConnected * targetScale
      };
    }
    return {
      visibility: 'hidden' as const
    };
  }, [connected, connectingEdge, showHandle, sourceScale, targetScale, translateStr]);

  return (
    <Handle
      style={styles}
      isConnectableEnd={styles && showHandle}
      isConnectableStart={false}
      type="target"
      id={handleId}
      position={position}
    />
  );
});

export default function Dom() {
  return <></>;
}
