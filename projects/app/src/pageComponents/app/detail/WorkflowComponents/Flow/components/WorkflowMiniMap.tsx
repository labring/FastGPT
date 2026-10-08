import React, {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Panel, useReactFlow, useStore, useViewport } from 'reactflow';
import {
  WORKFLOW_NODE_MEASUREMENT_ESTIMATE,
  getAbsoluteNodePositions,
  getNodeRect,
  isHiddenByFold,
  type CanvasViewport,
  type NodeDimensions,
  type NodeRect,
  type ViewportNode
} from '../canvas/dimensionIndex';
import { useWorkflowCanvasValue } from '../canvas/workflowCanvasContext';

type WorkflowMiniMapProps = {
  ariaLabel: string;
  style?: CSSProperties;
};

type MiniMapNode = {
  id: string;
  rect: NodeRect;
  selected?: boolean;
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

const getBounds = (rects: readonly NodeRect[]): NodeRect | undefined => {
  if (rects.length === 0) return;

  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const top = Math.min(...rects.map((rect) => rect.top));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const width = right - left;
  const height = bottom - top;

  return {
    left,
    right,
    top,
    bottom,
    width,
    height,
    centerX: left + width / 2,
    centerY: top + height / 2
  };
};

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
    return rect ? [{ id: node.id, rect, selected: node.selected }] : [];
  });
  const viewportRect = getViewportRect(viewport);
  if (!viewportRect) return;

  const bounds = getBounds([...miniMapNodes.map((node) => node.rect), viewportRect]);
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

const drawMiniMap = (
  canvas: HTMLCanvasElement,
  model: MiniMapModel | undefined,
  width: number,
  height: number
) => {
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

  model.nodes.forEach(({ rect, selected }) => {
    const mapped = mapRect(rect, model.transform);
    context.fillStyle = selected ? '#31323E' : '#CBD5E0';
    context.strokeStyle = selected ? '#2B3C30' : '#A0AEC0';
    context.lineWidth = 1;
    context.fillRect(mapped.x, mapped.y, mapped.width, mapped.height);
    context.strokeRect(mapped.x, mapped.y, mapped.width, mapped.height);
  });

  const view = mapRect(model.viewport, model.transform);
  context.beginPath();
  context.rect(0, 0, width, height);
  context.rect(view.x, view.y, view.width, view.height);
  context.fillStyle = 'rgba(255, 255, 255, 0.72)';
  context.fill('evenodd');
  context.strokeStyle = '#91929E';
  context.lineWidth = 1;
  context.strokeRect(view.x, view.y, view.width, view.height);
};

const WorkflowMiniMap = React.memo(function WorkflowMiniMap({
  ariaLabel,
  style
}: WorkflowMiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number>();
  const [canvasSize, setCanvasSize] = useState(DEFAULT_SIZE);
  const nodes = useWorkflowCanvasValue((value) => value.nodes);
  const dimensions = useWorkflowCanvasValue((value) => value.dimensionIndex);
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
          isFolded: node.data.isFolded,
          selected: node.selected
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
      drawMiniMap(canvasRef.current, model, canvasSize.width, canvasSize.height);
  }, [canvasSize.height, canvasSize.width, model]);

  const moveViewportToPoint = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!model || !Number.isFinite(model.transform.scale) || model.transform.scale <= 0) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const canvasX = event.clientX - rect.left;
      const canvasY = event.clientY - rect.top;
      const flowX = (canvasX - model.transform.offsetX) / model.transform.scale;
      const flowY = (canvasY - model.transform.offsetY) / model.transform.scale;
      const zoom = Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1;

      setViewport({
        x: flowWidth / 2 - flowX * zoom,
        y: flowHeight / 2 - flowY * zoom,
        zoom
      });
    },
    [flowHeight, flowWidth, model, setViewport, viewport.zoom]
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      event.stopPropagation();
      pointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      moveViewportToPoint(event);
    },
    [moveViewportToPoint]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      moveViewportToPoint(event);
    },
    [moveViewportToPoint]
  );

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = undefined;
    event.currentTarget.releasePointerCapture(event.pointerId);
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
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
    </Panel>
  );
});

WorkflowMiniMap.displayName = 'WorkflowMiniMap';

export default WorkflowMiniMap;
