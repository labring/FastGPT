import React, { useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { Box, Flex } from '@chakra-ui/react';
import { useWorkflowUIValue } from '../../../canvas/canvasState';
import { useWorkflowCanvasValue } from '../../../canvas/workflowCanvasContext';
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
  anchor?: { left?: number; top?: number; right?: number };
  portalTarget?: HTMLElement;
  /** 动态业务端口等首帧后挂到卡片右边缘；首帧保留局部内容供测量。 */
  nodeAnchored?: boolean;
};

export const MySourceHandle = React.memo(function MySourceHandle({
  nodeId,
  translate,
  handleId,
  position,
  showHandle = true,
  anchor,
  portalTarget,
  nodeAnchored = false
}: Props) {
  const { t } = useTranslation();
  const updateNodeInternals = useUpdateNodeInternals();
  const renderHandle = useContext(WorkflowHandleRenderContext);
  const cachedHandleCenter = useWorkflowCanvasValue((value) =>
    value.nodeDimensions.get(nodeId)?.sourceHandleCenters?.get(handleId)
  );
  const connected = useWorkflow((_structure, graph) =>
    graph.isHandleConnected({ nodeId, handleId, direction: 'source' })
  );
  const selected = useWorkflowSelectionValue((value) => value.selectedNodesMap[nodeId]);
  const isConnectingSelf = useWorkflowUIValue(
    (value) => value.connectingEdge?.handleId === handleId
  );
  const isConnectingTool = useWorkflowUIValue(
    (value) => value.connectingEdge?.handleId === NodeOutputKeyEnum.selectedTools
  );
  const isConnecting = useWorkflowUIValue((value) => !!value.connectingEdge);
  const isConnectingNode = useWorkflowUIValue((value) => value.connectingEdge?.nodeId === nodeId);
  const nodeIsHover = useWorkflowUIValue((value) => value.hoverNodeId === nodeId);
  const active = nodeIsHover || !!selected || isConnectingSelf;
  const visible =
    showHandle && (!isConnecting || isConnectingNode) && !isConnectingTool && (active || connected);

  const translateStr = useMemo(() => {
    if (!translate) return '';
    if (position === Position.Right) return `${translate[0] + 5}px, -50%`;
  }, [position, translate]);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [nodeAnchor, setNodeAnchor] = useState<{
    card: HTMLElement;
    left: number;
    top: number;
  }>();

  useLayoutEffect(() => {
    if (!nodeAnchored || typeof document === 'undefined') return;
    const measure = measureRef.current;
    const row = measure?.parentElement;
    if (!measure || !row) return;

    const update = () => {
      const node = measure.closest<HTMLElement>('.react-flow__node');
      if (!node) return;
      const measureRect = row.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      const scale = node.offsetHeight > 0 ? nodeRect.height / node.offsetHeight : 1;
      setNodeAnchor({
        card: node,
        left: node.offsetWidth,
        top:
          cachedHandleCenter?.y ?? (measureRect.top + measureRect.height / 2 - nodeRect.top) / scale
      });
    };

    update();
    const resizeObserver =
      typeof ResizeObserver === 'function' ? new ResizeObserver(update) : undefined;
    resizeObserver?.observe(measure);
    return () => resizeObserver?.disconnect();
  }, [cachedHandleCenter, nodeAnchored]);

  useLayoutEffect(() => {
    if (nodeAnchored && nodeAnchor) updateNodeInternals(nodeId);
  }, [nodeAnchored, nodeAnchor, nodeId, updateNodeInternals]);

  if (!renderHandle) return null;

  const resolvedAnchor =
    nodeAnchor && nodeAnchored ? { left: nodeAnchor.left, top: nodeAnchor.top } : anchor;
  const resolvedPortalTarget = nodeAnchored ? nodeAnchor?.card : portalTarget;
  const handle = (
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
      <Box
        data-workflow-node-anchored={nodeAnchored && resolvedPortalTarget ? 'true' : undefined}
        position="absolute"
        right={resolvedAnchor?.right ?? (resolvedAnchor?.left === undefined ? 0 : undefined)}
        left={resolvedAnchor?.left}
        top={resolvedAnchor?.top === undefined ? '50%' : `${resolvedAnchor.top}px`}
        w="0px"
        h="0px"
      >
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
  return resolvedPortalTarget && nodeAnchored ? (
    <>
      <span ref={measureRef} style={{ display: 'none' }} />
      {createPortal(handle, resolvedPortalTarget)}
    </>
  ) : nodeAnchored ? (
    <>
      <span ref={measureRef} style={{ display: 'none' }} />
      {handle}
    </>
  ) : (
    handle
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
