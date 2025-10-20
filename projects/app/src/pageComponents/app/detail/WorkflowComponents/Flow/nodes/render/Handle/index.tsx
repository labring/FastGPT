import React, { useMemo } from 'react';
import { Handle, Position } from 'reactflow';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  WorkflowBufferDataContext,
  WorkflowNodeDataContext
} from '../../../../context/workflowInitContext';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { Box, Flex } from '@chakra-ui/react';
import { WorkflowActionsContext } from '../../../../context/workflowActionsContext';
import { WorkflowUIContext } from '../../../../context/workflowUIContext';

const handleSizeConnected = 16;
const handleSizeConnecting = 30;
const handleAddIconSize = 22;

const sourceCommonStyle = {
  backgroundColor: 'white',
  borderRadius: '50%'
};

const handleConnectedStyle = {
  ...sourceCommonStyle,
  borderWidth: '3px',
  borderColor: '#94B5FF',
  width: handleSizeConnected,
  height: handleSizeConnected
};

const handleHighLightStyle = {
  ...sourceCommonStyle,
  borderWidth: '4px',
  borderColor: '#487FFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: handleSizeConnecting,
  height: handleSizeConnecting
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

  const node = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodeById(nodeId));
  const selected = useContextSelector(WorkflowNodeDataContext, (v) => v.selectedNodesMap[nodeId]);
  const connectingEdge = useContextSelector(WorkflowActionsContext, (ctx) => ctx.connectingEdge);
  const hoverNodeId = useContextSelector(WorkflowUIContext, (v) => v.hoverNodeId);

  const edgesData = useContextSelector(WorkflowBufferDataContext, (v) => {
    return {
      connected: v.edges.some((edge) => edge.sourceHandle === handleId),
      nodeFolded: node?.isFolded && v.edges.some((edge) => edge.source === nodeId)
    };
  });
  const connected = edgesData.connected;
  const nodeFolded = edgesData.nodeFolded;

  const nodeIsHover = hoverNodeId === nodeId;
  const active = useMemo(
    () => nodeIsHover || selected || connectingEdge?.handleId === handleId,
    [nodeIsHover, selected, connectingEdge, handleId]
  );

  const translateStr = useMemo(() => {
    if (!translate) return '';
    if (position === Position.Right) {
      return `${active ? translate[0] + 6 : translate[0]}px, -50%`;
    }
  }, [active, position, translate]);

  const { styles, showAddIcon } = useMemo(() => {
    if (active) {
      return {
        styles: {
          ...handleHighLightStyle,
          transform: `${translateStr ? `translate(${translateStr})` : ''}`
        },
        showAddIcon: true
      };
    }

    if (connected || nodeFolded) {
      return {
        styles: {
          ...handleConnectedStyle,
          transform: `${translateStr ? `translate(${translateStr})` : ''}`
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
  }, [active, connected, nodeFolded, translateStr]);

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
            name={'edgeAdd'}
            color={'primary.500'}
            pointerEvents={'none'}
            w={`${handleAddIconSize}px`}
            h={`${handleAddIconSize}px`}
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
  const connected = useContextSelector(WorkflowBufferDataContext, (v) =>
    v.edges.some((edge) => edge.targetHandle === handleId)
  );
  const connectingEdge = useContextSelector(WorkflowActionsContext, (ctx) => ctx.connectingEdge);

  const translateStr = useMemo(() => {
    if (!translate) return '';

    if (position === Position.Left) {
      return `${connectingEdge ? translate[0] - 6 : translate[0]}px, -50%`;
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
        transform: `${translateStr ? `translate(${translateStr})` : ''}`
      };
    }

    if (connected) {
      return {
        ...handleConnectedStyle,
        transform: `${translateStr ? `translate(${translateStr})` : ''}`
      };
    }
    return {
      visibility: 'hidden' as const
    };
  }, [connected, connectingEdge, showHandle, translateStr]);

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
