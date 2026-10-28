import React, { useContext, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { Box, Flex } from '@chakra-ui/react';
import { useWorkflowUIValue } from '../../../canvas/canvasState';
import { useWorkflowSelectionValue } from '../../../context/workflowSelectionContext';
import { useWorkflow } from '@/web/core/workflow/editor/react/useWorkflow';
import { WorkflowHandleRenderContext } from './handleRenderContext';

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

// 保持 ReactFlow 实际端口尺寸稳定，避免视觉高亮改变连线坐标。
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
  const renderHandle = useContext(WorkflowHandleRenderContext);
  const connected = useWorkflow((_structure, graph) =>
    graph.isHandleConnected({ nodeId, handleId, direction: 'source' })
  );
  const selected = useWorkflowSelectionValue((value) => value.selectedNodesMap[nodeId]);
  const isConnectingSelf = useWorkflowUIValue((value) => value.connectingEdge?.handleId === handleId);
  const isConnectingTool = useWorkflowUIValue(
    (value) => value.connectingEdge?.handleId === NodeOutputKeyEnum.selectedTools
  );
  const isConnecting = useWorkflowUIValue((value) => !!value.connectingEdge);
  const isConnectingNode = useWorkflowUIValue((value) => value.connectingEdge?.nodeId === nodeId);
  const nodeIsHover = useWorkflowUIValue((value) => value.hoverNodeId === nodeId);
  const active = nodeIsHover || !!selected || isConnectingSelf;
  const visible =
    showHandle &&
    (!isConnecting || isConnectingNode) &&
    !isConnectingTool &&
    (active || connected);

  const translateStr = useMemo(() => {
    if (!translate) return '';
    if (position === Position.Right) return `${translate[0] + 5}px, -50%`;
  }, [position, translate]);

  if (!renderHandle) return null;

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
      <Box position="absolute" right={0} top="50%" w="0px" h="0px">
        <Handle
          style={{
            ...handleBaseStyle,
            transform: translateStr ? `translate(${translateStr})` : undefined,
            visibility: visible ? 'visible' : 'hidden'
          }}
          type="source"
          id={handleId}
          data-workflow-source-handle-id={handleId}
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
      </Box>
    </MyTooltip>
  );
});

export const MyTargetHandle = React.memo(function MyTargetHandle({
  nodeId,
  handleId,
  position,
  translate,
  showHandle
}: Props & { showHandle: boolean }) {
  const renderHandle = useContext(WorkflowHandleRenderContext);
  const connected = useWorkflow((_structure, graph) =>
    graph.isHandleConnected({ nodeId, handleId, direction: 'target' })
  );
  const isConnecting = useWorkflowUIValue((value) => !!value.connectingEdge);

  const translateStr = useMemo(() => {
    if (!translate) return '';
    if (position === Position.Left) return `${translate[0] - 5}px, -50%`;
  }, [position, translate]);

  if (!renderHandle) return null;

  return (
    <Handle
      style={{
        ...handleBaseStyle,
        transform: translateStr ? `translate(${translateStr})` : undefined,
        visibility: (isConnecting || connected) && showHandle ? 'visible' : 'hidden'
      }}
      isConnectableEnd={showHandle}
      isConnectableStart={false}
      type="target"
      id={handleId}
      position={position}
    >
      <Box
        style={isConnecting ? handleHighLightStyle : handleConnectedStyle}
        flexShrink={0}
        pointerEvents={'none'}
      />
    </Handle>
  );
});
