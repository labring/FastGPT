import React, { useMemo, useState } from 'react';
import { Handle, Position } from 'reactflow';
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
const handleSizeHover = 24;
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

const MySourceHandle = React.memo(function MySourceHandle({
  nodeId,
  translate,
  handleId,
  position
}: Props) {
  const { t } = useTranslation();

  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);
  const connectingEdge = useContextSelector(WorkflowContext, (ctx) => ctx.connectingEdge);
  const nodes = useContextSelector(WorkflowInitContext, (v) => v.nodes);
  const hoverNodeId = useContextSelector(WorkflowEventContext, (v) => v.hoverNodeId);

  const node = useMemo(() => nodes.find((node) => node.data.nodeId === nodeId), [nodes, nodeId]);
  const connected = edges.some((edge) => edge.sourceHandle === handleId);
  const nodeFolded = node?.data.isFolded && edges.some((edge) => edge.source === nodeId);
  const nodeIsHover = hoverNodeId === nodeId;
  const active = useMemo(
    () => nodeIsHover || node?.selected || connectingEdge?.handleId === handleId,
    [nodeIsHover, node?.selected, connectingEdge, handleId]
  );

  const [isHovered, setIsHovered] = useState(false);

  const translateStr = useMemo(() => {
    if (!translate) return '';
    if (position === Position.Right) {
      return isHovered
        ? `${active ? translate[0] + 3.5 : translate[0]}px, -50%`
        : `${active ? translate[0] + 2 : translate[0]}px, -50%`;
    }
  }, [active, isHovered, position, translate]);

  const transform = useMemo(
    () => (translateStr ? `translate(${translateStr})` : ''),
    [translateStr]
  );

  const { styles, showAddIcon } = useMemo(() => {
    if (active) {
      return {
        styles: {
          ...handleHighLightStyle,
          ...(translateStr && {
            transform
          }),
          ...(isHovered ? { width: handleSizeHover, height: handleSizeHover } : {})
        },
        showAddIcon: true
      };
    }

    if (connected || nodeFolded) {
      return {
        styles: {
          ...(translateStr && {
            transform
          }),
          ...handleConnectedStyle,
          ...(isHovered ? { width: handleSizeHover, height: handleSizeHover } : {})
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
  }, [active, connected, nodeFolded, translateStr, transform, isHovered]);

  const RenderHandle = useMemo(() => {
    return (
      <MyTooltip
        label={
          <Box>
            <Flex>
              <Box color={'myGray.800'}>{t('workflow:Click')}</Box>
              <Box color={'myGray.600'}>{t('workflow:to_add_node')}</Box>
            </Flex>
            <Flex>
              <Box color={'myGray.800'}>{t('workflow:Drag')}</Box>
              <Box color={'myGray.600'}>{t('workflow:to_connect_node')}</Box>
            </Flex>
          </Box>
        }
        px={2}
        py={1}
        shouldWrapChildren={false}
      >
        <Handle
          style={styles}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          type="source"
          id={handleId}
          position={position}
          isConnectableEnd={false}
        >
          {showAddIcon && (
            <MyIcon
              name={'edgeAdd'}
              color={'primary.500'}
              pointerEvents={'none'}
              w={isHovered ? '18px' : '14px'}
              h={isHovered ? '18px' : '14px'}
            />
          )}
        </Handle>
      </MyTooltip>
    );
  }, [t, styles, handleId, position, showAddIcon, isHovered]);

  if (!node) return null;
  if (connectingEdge?.handleId === NodeOutputKeyEnum.selectedTools) return null;

  return <>{RenderHandle}</>;
});

export const SourceHandle = (props: Props) => {
  return <MySourceHandle {...props} />;
};

const MyTargetHandle = React.memo(function MyTargetHandle({
  nodeId,
  handleId,
  position,
  translate,
  showHandle
}: Props & {
  showHandle: boolean;
}) {
  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);
  const connectingEdge = useContextSelector(WorkflowContext, (ctx) => ctx.connectingEdge);

  const connected = edges.some((edge) => edge.targetHandle === handleId);

  const translateStr = useMemo(() => {
    if (!translate) return '';

    if (position === Position.Left) {
      return `${connectingEdge ? translate[0] - 2 : translate[0]}px, -50%`;
    }
  }, [connectingEdge, position, translate]);

  const transform = useMemo(
    () => (translateStr ? `translate(${translateStr})` : ''),
    [translateStr]
  );

  const styles = useMemo(() => {
    if (!connectingEdge && !connected && !showHandle) {
      return {
        visibility: 'hidden' as const
      };
    }

    if (connectingEdge) {
      return {
        ...handleHighLightStyle,
        transform
      };
    }

    if (connected) {
      return {
        ...handleConnectedStyle,
        transform
      };
    }
    return {
      visibility: 'hidden' as const
    };
  }, [connected, connectingEdge, showHandle, transform]);

  const RenderHandle = useMemo(() => {
    return (
      <Handle
        style={styles}
        isConnectableEnd={styles && showHandle}
        type="target"
        id={handleId}
        position={position}
      />
    );
  }, [position, handleId, styles, showHandle]);

  return RenderHandle;
});

export const TargetHandle = (
  props: Props & {
    showHandle: boolean;
  }
) => {
  return <MyTargetHandle {...props} />;
};

export default function Dom() {
  return <></>;
}
