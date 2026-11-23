import React, {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Panel, useReactFlow, useStore, useViewport } from '@xyflow/react';
import {
  WORKFLOW_NODE_MEASUREMENT_ESTIMATE,
  getAbsoluteNodePositions,
  getNodeRect,
  getRectBounds,
  isHiddenByFold,
  type CanvasViewport,
  type NodeDimensions,
  type NodeRect,
  type ViewportNode
} from '../canvas/nodeDimensions';
import {
  useWorkflowCanvasRendererValue,
  useWorkflowCanvasValue
} from '../canvas/workflowCanvasContext';

type WorkflowMiniMapProps = {
  ariaLabel: string;
  style?: CSSProperties;
};

type MiniMapNode = {
  id: string;
  rect: NodeRect;
};

type MiniMapTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

type MiniMapModel = {
  nodes: MiniMapNode[];
  viewport: NodeRect;
  transform: MiniMapTransform;
};

const DEFAULT_SIZE = { width: 150, height: 92 };
const MINIMAP_PADDING = 8;

const getViewportRect = (viewport: CanvasViewport): NodeRect | undefined => {
  if (
    !Number.isFinite(viewport.zoom) ||
    viewport.zoom <= 0 ||
    !Number.isFinite(viewport.width) ||
    viewport.width <= 0 ||
    !Number.isFinite(viewport.height) ||
    viewport.height <= 0
  ) {
    return;
  }

  const width = viewport.width / viewport.zoom;
  const height = viewport.height / viewport.zoom;
  const left = -viewport.x / viewport.zoom;
  const top = -viewport.y / viewport.zoom;

  return {
    left,
    right: left + width,
    top,
    bottom: top + height,
    width,
    height,
    centerX: left + width / 2,
    centerY: top + height / 2
  };
};

const mapRect = (rect: NodeRect, transform: MiniMapTransform) => ({
  x: rect.left * transform.scale + transform.offsetX,
  y: rect.top * transform.scale + transform.offsetY,
  width: rect.width * transform.scale,
  height: rect.height * transform.scale
});

const getMiniMapModel = ({
  nodes,
  dimensions,
  viewport,
  canvasWidth,
  canvasHeight
}: {
  nodes: readonly ViewportNode[];
  dimensions: ReadonlyMap<string, NodeDimensions>;
  viewport: CanvasViewport;
  canvasWidth: number;
  canvasHeight: number;
}): MiniMapModel | undefined => {
  if (canvasWidth <= 0 || canvasHeight <= 0) return;

  const { nodeById, positionById } = getAbsoluteNodePositions(nodes);
  const miniMapNodes = nodes.flatMap<MiniMapNode>((node) => {
    if (isHiddenByFold(node, nodeById)) return [];

    const dimension =
      dimensions.get(node.id)?.occupied ?? WORKFLOW_NODE_MEASUREMENT_ESTIMATE.occupied;
    const position = positionById.get(node.id) ?? node.position;
    const rect = getNodeRect({ id: node.id, position }, dimension);
    return rect ? [{ id: node.id, rect }] : [];
  });
  const viewportRect = getViewportRect(viewport);
  if (!viewportRect) return;

  const bounds = getRectBounds([...miniMapNodes.map((node) => node.rect), viewportRect]);
  if (!bounds) return;

  const availableWidth = Math.max(canvasWidth - MINIMAP_PADDING * 2, 1);
  const availableHeight = Math.max(canvasHeight - MINIMAP_PADDING * 2, 1);
  const scale = Math.min(
    availableWidth / Math.max(bounds.width, 1),
    availableHeight / Math.max(bounds.height, 1)
  );

  return {
    nodes: miniMapNodes,
    viewport: viewportRect,
    transform: {
      scale,
      offsetX: canvasWidth / 2 - bounds.centerX * scale,
      offsetY: canvasHeight / 2 - bounds.centerY * scale
    }
  };
};

const drawMiniMap = ({
  canvas,
  model,
  width,
  height
}: {
  canvas: HTMLCanvasElement;
  model: MiniMapModel | undefined;
  width: number;
  height: number;
}) => {
  const context = canvas.getContext('2d');
  if (!context) return;

  const devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const pixelWidth = Math.max(Math.round(width * devicePixelRatio), 1);
  const pixelHeight = Math.max(Math.round(height * devicePixelRatio), 1);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, width, height);
  if (!model) return;

  context.fillStyle = '#E2E2E2';
  model.nodes.forEach(({ rect }) => {
    const mapped = mapRect(rect, model.transform);
    context.fillRect(mapped.x, mapped.y, mapped.width, mapped.height);
  });

  const view = mapRect(model.viewport, model.transform);
  context.beginPath();
  context.rect(0, 0, width, height);
  context.rect(view.x, view.y, view.width, view.height);
  context.fillStyle = 'rgba(240, 240, 240, 0.6)';
  context.fill('evenodd');
};

const WorkflowMiniMap = React.memo(function WorkflowMiniMap({
  ariaLabel,
  style
}: WorkflowMiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: number; transform: MiniMapTransform; viewport: CanvasViewport }>();
  const [canvasSize, setCanvasSize] = useState(DEFAULT_SIZE);
  const nodes = useWorkflowCanvasRendererValue((value) => value.nodes);
  const dimensions = useWorkflowCanvasValue((value) => value.nodeDimensions);
  const cancelPendingViewport = useWorkflowCanvasValue((value) => value.cancelPendingViewport);
  const { setViewport } = useReactFlow();
  const viewport = useViewport();
  const flowWidth = useStore((state) => state.width);
  const flowHeight = useStore((state) => state.height);

  const viewportData = useMemo<CanvasViewport>(
    () => ({
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom,
      width: flowWidth,
      height: flowHeight
    }),
    [flowHeight, flowWidth, viewport.x, viewport.y, viewport.zoom]
  );
  const model = useMemo(
    () =>
      getMiniMapModel({
        nodes: nodes.map((node) => ({
          id: node.id,
          position: node.position,
          parentNodeId: node.data.parentNodeId,
          isFolded: node.data.isFolded
        })),
        dimensions,
        viewport: viewportData,
        canvasWidth: canvasSize.width,
        canvasHeight: canvasSize.height
      }),
    [canvasSize.height, canvasSize.width, dimensions, nodes, viewportData]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width > 0 && height > 0) setCanvasSize({ width, height });
    };

    updateSize();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (canvasRef.current)
      drawMiniMap({
        canvas: canvasRef.current,
        model,
        width: canvasSize.width,
        height: canvasSize.height
      });
  }, [canvasSize.height, canvasSize.width, model]);

  const moveViewportToPoint = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.id !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();

      const rect = event.currentTarget.getBoundingClientRect();
      const { scale, offsetX, offsetY } = drag.transform;
      const { width, height, zoom } = drag.viewport;
      const flowX = (event.clientX - rect.left - offsetX) / scale;
      const flowY = (event.clientY - rect.top - offsetY) / scale;

      setViewport({
        x: width / 2 - flowX * zoom,
        y: height / 2 - flowY * zoom,
        zoom
      });
    },
    [setViewport]
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!model || dragRef.current || event.button !== 0) return;
      cancelPendingViewport();
      // 当前视口会改变小地图边界，拖拽期间要用按下时的坐标系。
      dragRef.current = { id: event.pointerId, transform: model.transform, viewport: viewportData };
      event.currentTarget.setPointerCapture(event.pointerId);
      moveViewportToPoint(event);
    },
    [cancelPendingViewport, model, moveViewportToPoint, viewportData]
  );

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.id !== event.pointerId) return;
    dragRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.stopPropagation();
  }, []);

  return (
    <Panel
      position={'bottom-right'}
      style={{
        padding: 0,
        overflow: 'hidden',
        background: '#FFFFFF',
        ...style
      }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
        <canvas
          ref={canvasRef}
          role={'img'}
          aria-label={ariaLabel}
          style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={moveViewportToPoint}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onLostPointerCapture={onPointerUp}
        />
      </div>
    </Panel>
  );
});

WorkflowMiniMap.displayName = 'WorkflowMiniMap';

export default WorkflowMiniMap;
