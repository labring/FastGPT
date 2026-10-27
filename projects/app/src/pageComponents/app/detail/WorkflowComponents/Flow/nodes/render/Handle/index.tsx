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

const handleSizeConnected = 24;
const handleSizeConnecting = 32;
const handleAddIconSize = 24;

const sourceCommonStyle = {
  backgroundColor: 'white',
  borderRadius: '50%'
};

const handleConnectedStyle = {
  ...sourceCommonStyle,
  borderWidth: '3px',
  borderColor: '#94B5FF',
  width: handleSizeConnected,
  height: handleSizeConnected,
  zIndex: 15
};

const handleHighLightStyle = {
  ...sourceCommonStyle,
  borderWidth: '4px',
  borderColor: '#487FFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: handleSizeConnecting,
  height: handleSizeConnecting,
  zIndex: 15
};

// 两种视觉状态共用同一个测量区域，放大内部图形不会改变连线端点。
const handleBaseStyle: React.CSSProperties = {
  width: handleSizeConnected,
  height: handleSizeConnected,
  border: 'none',
  background: 'transparent',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 15
};

type Props = {
  nodeId: string;
  handleId: string;
  position: Position;
  translate?: [number, number];
  showHandle?: boolean;
};

export const MySourceHandle = React.memo(function MySourceHandle({
  nodeId,
  translate,
  handleId,
  position,
  showHandle = true
}: Props) {
  const { t } = useTranslation();
  const connectingEdge = useContextSelector(WorkflowActionsContext, (ctx) => ctx.connectingEdge);

  const node = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodeById(nodeId));
  const selected = useContextSelector(WorkflowNodeDataContext, (v) => v.selectedNodesMap[nodeId]);
  const hoverNodeId = useContextSelector(WorkflowUIContext, (v) => v.hoverNodeId);

  const edgesData = useContextSelector(WorkflowBufferDataContext, (v) => {
    return {
      connected: v.edges.some((edge) => edge.sourceHandle === handleId)
    };
  });
  const connected = edgesData.connected;

  const nodeIsHover = hoverNodeId === nodeId;
  const active = useMemo(
    () => nodeIsHover || selected || connectingEdge?.handleId === handleId,
    [nodeIsHover, selected, connectingEdge, handleId]
  );

  const translateStr = useMemo(() => {
    if (!translate) return '';
    if (position === Position.Right) {
      return `${translate[0] + 5}px, -50%`;
    }
  }, [position, translate]);

  if (!node) return null;
  const visible =
    showHandle &&
    (!connectingEdge || connectingEdge.nodeId === nodeId) &&
    connectingEdge?.handleId !== NodeOutputKeyEnum.selectedTools &&
    (active || connected);

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
        // 实际端口的中心和尺寸固定，高亮只放大内部图形，避免测量覆盖已有连线坐标。
        style={{
          ...handleBaseStyle,
          transform: translateStr ? `translate(${translateStr})` : undefined,
          visibility: visible ? 'visible' : 'hidden'
        }}
        type="source"
        id={handleId}
        position={position}
        isConnectableEnd={false}
        isConnectableStart={showHandle}
      >
        <Box
          style={active ? handleHighLightStyle : handleConnectedStyle}
          flexShrink={0}
          pointerEvents={'none'}
        >
          {active && (
            <MyIcon
              name={'edgeAdd'}
              color={'primary.500'}
              pointerEvents={'none'}
              w={`${handleAddIconSize}px`}
              h={`${handleAddIconSize}px`}
            />
          )}
        </Box>
      </Handle>
    </MyTooltip>
  );
});

export const MyTargetHandle = React.memo(function MyTargetHandle({
  handleId,
  position,
  translate,
  showHandle
}: Props & {
  showHandle: boolean;
}) {
  const connectingEdge = useContextSelector(WorkflowActionsContext, (ctx) => ctx.connectingEdge);
  const connected = useContextSelector(WorkflowBufferDataContext, (v) =>
    v.edges.some((edge) => edge.targetHandle === handleId)
  );

  const translateStr = useMemo(() => {
    if (!translate) return '';

    if (position === Position.Left) {
      return `${translate[0] - 5}px, -50%`;
    }
  }, [position, translate]);

  return (
    <Handle
      style={{
        ...handleBaseStyle,
        transform: translateStr ? `translate(${translateStr})` : undefined,
        visibility: (connectingEdge || connected) && showHandle ? 'visible' : 'hidden'
      }}
      isConnectableEnd={showHandle}
      isConnectableStart={false}
      type="target"
      id={handleId}
      position={position}
    >
      <Box
        style={connectingEdge ? handleHighLightStyle : handleConnectedStyle}
        flexShrink={0}
        pointerEvents={'none'}
      />
    </Handle>
  );
});

export default function Dom() {
  return <></>;
}
