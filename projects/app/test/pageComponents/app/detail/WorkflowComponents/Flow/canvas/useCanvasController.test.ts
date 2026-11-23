import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import type { WorkflowRuntimePort } from '@fastgpt/global/core/workflow/editor/types';
import { hydrateRuntime } from '@/web/core/workflow/editor/codec';
import {
  createProjectionCache,
  projectRuntimeCanvas
} from '@/web/core/workflow/editor/canvas/projectWorkflowCanvas';
import * as coreConnections from '@fastgpt/workflow-core/edge/validation';
import type { Edge, Node, NodePositionChange, XYPosition } from '@xyflow/react';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const controllerState = vi.hoisted(() => ({
  runtime: undefined as WorkflowRuntimePort | undefined,
  edges: [] as Edge[],
  connectEdge: vi.fn(),
  toast: vi.fn(),
  setConnectingEdge: vi.fn()
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: controllerState.toast })
}));
vi.mock('@xyflow/react', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useReactFlow: () => ({
    getEdge: (id: string) => controllerState.edges.find((edge) => edge.id === id)
  }),
  useStoreApi: () => ({})
}));
vi.mock('@/web/core/workflow/editor/session/workflowSession', () => ({
  useWorkflowRuntime: () => controllerState.runtime,
  useWorkflowIssueFocusAction: () => () => undefined,
  useWorkflowIssueFocusRef: () => ({ current: undefined })
}));
vi.mock('@/web/core/workflow/editor/react/useWorkflow', () => ({
  useWorkflowActions: () => ({
    ...controllerState.runtime?.getWorkflowActions(),
    connectEdge: controllerState.connectEdge
  })
}));
vi.mock('@/web/core/workflow/editor/react/useWorkflowQueries', () => ({
  useCanvas: () => ({ commitGeometry: () => undefined })
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/canvas/workflowCanvasContext', () => ({
  useWorkflowCanvasRendererValue: (selector: (value: unknown) => unknown) =>
    selector({ applyEdgeChanges: () => undefined }),
  useWorkflowCanvasValue: (selector: (value: unknown) => unknown) => selector({})
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/canvas/canvasState', () => ({
  useWorkflowUIValue: (selector: (value: unknown) => unknown) =>
    selector({ setConnectingEdge: controllerState.setConnectingEdge })
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/panels/workflowPanelState', () => ({
  useWorkflowModalValue: (selector: (value: unknown) => unknown) => selector({})
}));

// Mock Markdown component: its CSS imports (katex) cannot be resolved under vitest.
// useCanvasController.tsx transitively imports AppContext -> Markdown.
vi.mock('@/components/Markdown', () => ({ default: () => null }));
vi.mock('katex/dist/katex.min.css', () => ({}));

import {
  useCanvasController,
  collectClearSelectionIds,
  collectSelectionConflictIds,
  collectGeometryUpdates,
  collectCommittedGeometryNodeIds,
  captureWorkflowDrag,
  getContainerDescendantIds,
  getGeometryNodeIdsForDrag,
  getWorkflowDragNodeIds,
  getPositionDelta,
  computeHelperLines as computeHelperLinesWithNode,
  dropEdgeDisconnectsOfRemovedNodes
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/canvas/useCanvasController';

// Helpers
const buildNode = ({
  id,
  x,
  y,
  width = 50,
  height = 50,
  extra = {}
}: {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  extra?: Partial<Node>;
}): Node => ({
  id,
  position: { x, y },
  data: {},
  width,
  height,
  ...extra
});

const buildPositionChange = ({
  id,
  position,
  dragging = true
}: {
  id: string;
  position: XYPosition | undefined;
  dragging?: boolean;
}): NodePositionChange =>
  ({
    id,
    type: 'position',
    position,
    dragging
  }) as NodePositionChange;

const computeHelperLines = ({
  change,
  nodes,
  distance
}: {
  change: NodePositionChange;
  nodes: Node[];
  distance?: number;
}) =>
  computeHelperLinesWithNode({
    change,
    node: nodes.find((node) => node.id === change.id),
    nodes,
    distance,
    getNodeDimension: (nodeId) => {
      const node = nodes.find((item) => item.id === nodeId);
      return node ? { width: node.width ?? 0, height: node.height ?? 0 } : undefined;
    }
  });

describe('collectGeometryUpdates', () => {
  it('keeps dragging frames out of Runtime geometry commits', () => {
    expect([
      ...collectCommittedGeometryNodeIds([
        buildPositionChange({ id: 'dragging', position: { x: 11, y: 20 } })
      ])
    ]).toEqual([]);
    expect([
      ...collectCommittedGeometryNodeIds([
        buildPositionChange({ id: 'dragging', position: { x: 11, y: 20 } }),
        buildPositionChange({ id: 'committed', position: { x: 12, y: 20 }, dragging: false })
      ])
    ]).toEqual(['committed']);
  });

  it('drops zero-delta container children and keeps moved nodes', () => {
    const currentNodes = [
      buildNode({ id: 'parent', x: 10, y: 20 }),
      buildNode({ id: 'child', x: 30, y: 40 })
    ];
    const previousPositions = new Map([
      ['parent', { x: 10, y: 20 }],
      ['child', { x: 30, y: 40 }]
    ]);

    expect(
      collectGeometryUpdates({
        nodeIds: ['parent', 'child'],
        currentNodes,
        getPreviousPosition: (nodeId) => previousPositions.get(nodeId)
      })
    ).toEqual([]);
  });

  it('only emits the moved node from a multi-selection batch', () => {
    const currentNodes = [
      buildNode({ id: 'moved', x: 11, y: 20 }),
      buildNode({ id: 'steady', x: 30, y: 40 })
    ];
    const previousPositions = new Map([
      ['moved', { x: 10, y: 20 }],
      ['steady', { x: 30, y: 40 }]
    ]);

    expect(
      collectGeometryUpdates({
        nodeIds: ['moved', 'steady'],
        currentNodes,
        getPreviousPosition: (nodeId) => previousPositions.get(nodeId)
      })
    ).toEqual([{ nodeId: 'moved', position: { x: 11, y: 20 } }]);
  });
});

describe('getPositionDelta', () => {
  it.each([
    [
      { x: 0, y: 0 },
      { x: -10, y: -20 }
    ],
    [{ x: 0 }, { x: -10, y: 0 }],
    [{ y: 0 }, { x: 0, y: -20 }]
  ])('honors zero coordinates in %j', (position, delta) => {
    expect(getPositionDelta({ x: 10, y: 20 }, position)).toEqual(delta);
  });
});

describe('container drag geometry', () => {
  const hierarchyNode = ({
    id,
    parentNodeId,
    x,
    y,
    selected = false
  }: {
    id: string;
    parentNodeId: string | undefined;
    x: number;
    y: number;
    selected?: boolean;
  }) =>
    buildNode({
      id,
      x,
      y,
      width: 50,
      height: 50,
      extra: {
        selected,
        data: { parentNodeId }
      }
    });

  it('moves every descendant with a container while keeping selected child roots independent', () => {
    const nodes = [
      hierarchyNode({ id: 'container', parentNodeId: undefined, x: 100, y: 200, selected: true }),
      hierarchyNode({ id: 'nested', parentNodeId: 'container', x: 20, y: 30, selected: true }),
      hierarchyNode({ id: 'leaf', parentNodeId: 'nested', x: 4, y: 5, selected: true }),
      hierarchyNode({ id: 'outside', parentNodeId: undefined, x: 700, y: 800 })
    ];

    expect([...getContainerDescendantIds(nodes, 'container')]).toEqual(['nested', 'leaf']);
    expect([...getWorkflowDragNodeIds(nodes, 'container')]).toEqual([
      'container',
      'nested',
      'leaf'
    ]);

    const childGesture = captureWorkflowDrag(
      [
        hierarchyNode({ id: 'container', parentNodeId: undefined, x: 100, y: 200 }),
        hierarchyNode({ id: 'child', parentNodeId: 'container', x: 20, y: 30, selected: true })
      ],
      'child'
    );
    expect([...childGesture.nodeIds]).toEqual(['child']);
  });

  it('includes container ancestors so bbox relocation commits with child movement', () => {
    const nodes = [
      hierarchyNode({ id: 'container', parentNodeId: undefined, x: 100, y: 200 }),
      hierarchyNode({ id: 'child', parentNodeId: 'container', x: 20, y: 30 })
    ];
    const gesture = captureWorkflowDrag(nodes, 'child');

    expect([...getGeometryNodeIdsForDrag(nodes, gesture)]).toEqual(['child', 'container']);
  });
});

describe('computeHelperLines', () => {
  it.each([
    { label: 'missing node', id: 'missing', position: { x: 0, y: 0 } },
    { label: 'missing position', id: 'a', position: undefined },
    { label: 'no other node', id: 'a', position: { x: 0, y: 0 } }
  ])('returns no snap for $label', ({ id, position }) => {
    expect(
      computeHelperLines({
        change: buildPositionChange({ id, position }),
        nodes: [buildNode({ id: 'a', x: 0, y: 0 })]
      })
    ).toEqual({
      horizontal: undefined,
      vertical: undefined,
      snapPosition: { x: undefined, y: undefined }
    });
  });

  it('should fall back to 0 width/height when node has no size', () => {
    const change = buildPositionChange({ id: 'a', position: { x: 0, y: 0 } });
    // nodeA without width/height
    const nodeA: Node = { id: 'a', position: { x: 0, y: 0 }, data: {} } as any;
    const nodeB: Node = { id: 'b', position: { x: 0, y: 200 }, data: {} } as any;
    const result = computeHelperLines({ change, nodes: [nodeA, nodeB] });
    // LL = |0 - 0| = 0, triggers vertical snap
    expect(result.snapPosition.x).toBe(0);
    // With zero widths, centerX = 0 for both -> also triggers CXCX equal branch
    expect(result.vertical).toBeDefined();
  });

  it.each([
    ['left-left', [0, 0, 50, 50], [0, 500, 100, 50], 'x', 0, 0],
    ['right-right', [0, 0, 100, 50], [50, 500, 50, 50], 'x', 0, 100],
    ['left-right', [100, 0, 50, 50], [0, 500, 100, 50], 'x', 100, 100],
    ['right-left', [0, 0, 100, 50], [100, 500, 50, 50], 'x', 0, 100],
    ['top-top', [0, 0, 50, 50], [500, 0, 50, 100], 'y', 0, 0],
    ['bottom-top', [0, 0, 50, 100], [500, 100, 50, 50], 'y', 0, 100],
    ['bottom-bottom', [0, 50, 50, 100], [500, 0, 50, 150], 'y', 50, 150],
    ['top-bottom', [0, 100, 50, 50], [500, 0, 50, 100], 'y', 100, 100],
    ['center-x', [0, 0, 100, 50], [25, 500, 50, 50], 'x', 0, 50],
    ['center-y', [0, 0, 50, 100], [500, 25, 50, 50], 'y', 0, 50]
  ] as const)('snaps %s', (_label, a, b, axis, snapPosition, linePosition) => {
    const nodeA = buildNode({ id: 'a', x: a[0], y: a[1], width: a[2], height: a[3] });
    const nodeB = buildNode({ id: 'b', x: b[0], y: b[1], width: b[2], height: b[3] });
    const result = computeHelperLines({
      change: buildPositionChange({ id: 'a', position: nodeA.position }),
      nodes: [nodeA, nodeB]
    });
    expect(result.snapPosition[axis]).toBe(snapPosition);
    expect((axis === 'x' ? result.vertical : result.horizontal)?.position).toBe(linePosition);
  });

  it('should add additional nodes to vertical.nodes when LL equals current verticalDistance', () => {
    const change = buildPositionChange({ id: 'a', position: { x: 0, y: 0 } });
    const nodeA = buildNode({ id: 'a', x: 0, y: 0, width: 50, height: 50 });
    // Both B and C have left=0 (LL=0). C iteration will hit else-if.
    const nodeB = buildNode({ id: 'b', x: 0, y: 500, width: 100, height: 50 });
    const nodeC = buildNode({ id: 'c', x: 0, y: 1000, width: 100, height: 50 });
    const result = computeHelperLines({ change, nodes: [nodeA, nodeB, nodeC] });
    expect(result.snapPosition.x).toBe(0);
    expect(result.vertical?.nodes.length).toBeGreaterThanOrEqual(3); // A + B + C at least
  });

  it('should add additional nodes to horizontal.nodes when TT equals current horizontalDistance', () => {
    const change = buildPositionChange({ id: 'a', position: { x: 0, y: 0 } });
    const nodeA = buildNode({ id: 'a', x: 0, y: 0, width: 50, height: 50 });
    // Two nodes with top=0, different heights so only TT triggers
    const nodeB = buildNode({ id: 'b', x: 500, y: 0, width: 50, height: 100 });
    const nodeC = buildNode({ id: 'c', x: 1000, y: 0, width: 50, height: 100 });
    const result = computeHelperLines({ change, nodes: [nodeA, nodeB, nodeC] });
    expect(result.snapPosition.y).toBe(0);
    expect(result.horizontal?.nodes.length).toBeGreaterThanOrEqual(3);
  });

  it('should respect custom distance parameter (larger than default)', () => {
    const change = buildPositionChange({ id: 'a', position: { x: 20, y: 0 } });
    const nodeA = buildNode({ id: 'a', x: 20, y: 0, width: 50, height: 50 }); // left=20, right=70, centerX=45
    // Width 200 separates all LL/RR/LR/RL/CXCX distances. Only LL=20 is small.
    const nodeB = buildNode({ id: 'b', x: 0, y: 500, width: 200, height: 50 }); // left=0, right=200, centerX=100
    const noSnap = computeHelperLines({ change, nodes: [nodeA, nodeB] });
    expect(noSnap.snapPosition.x).toBeUndefined();

    const change2 = buildPositionChange({ id: 'a', position: { x: 20, y: 0 } });
    const snap = computeHelperLines({ change: change2, nodes: [nodeA, nodeB], distance: 30 });
    expect(snap.snapPosition.x).toBe(0);
  });

  it('should leave snapPosition unchanged when all distances exceed threshold', () => {
    const change = buildPositionChange({ id: 'a', position: { x: 1000, y: 1000 } });
    const nodeA = buildNode({ id: 'a', x: 1000, y: 1000, width: 50, height: 50 });
    const nodeB = buildNode({ id: 'b', x: 0, y: 0, width: 50, height: 50 });
    const result = computeHelperLines({ change, nodes: [nodeA, nodeB] });
    expect(result.snapPosition.x).toBeUndefined();
    expect(result.snapPosition.y).toBeUndefined();
    // default vertical/horizontal from nodeABounds centers (set by first iteration)
    expect(result.vertical?.position).toBe(1025);
    expect(result.horizontal?.position).toBe(1025);
  });
});

describe('dropEdgeDisconnectsOfRemovedNodes', () => {
  const edge = (source: string, target: string) => ({
    id: `${source}-${target}`,
    source,
    target
  });

  it('drops incoming and outgoing edges of a deleted node and keeps unrelated edges', () => {
    expect(
      dropEdgeDisconnectsOfRemovedNodes(
        [edge('a', 'b'), edge('b', 'c'), edge('d', 'e')],
        new Set(['b'])
      )
    ).toEqual([edge('d', 'e')]);
  });

  it('keeps edges in the document when nothing is being deleted', () => {
    const edges = [edge('a', 'b')];
    expect(dropEdgeDisconnectsOfRemovedNodes(edges, new Set())).toEqual(edges);
  });
});

// 06a-8 第一部分的三条行为不变量：选中写入只对真的变了的节点发 select 变更。
const selectionNode = (
  id: string,
  {
    selected = false,
    parentNodeId,
    flowNodeType = 'tools'
  }: { selected?: boolean; parentNodeId?: string; flowNodeType?: string } = {}
): Node => ({ id, position: { x: 0, y: 0 }, data: { flowNodeType, parentNodeId }, selected });

describe('collectClearSelectionIds', () => {
  const nodes = [
    selectionNode('a', { selected: true }),
    selectionNode('b'),
    selectionNode('c', { selected: true }),
    selectionNode('focus', { selected: true })
  ];

  it('returns only the ids of nodes that are actually selected', () => {
    expect(collectClearSelectionIds(nodes)).toEqual(['a', 'c', 'focus']);
  });

  it('skips the focused issue node so save-gate positioning keeps it selected', () => {
    expect(collectClearSelectionIds(nodes, 'focus')).toEqual(['a', 'c']);
  });

  it('returns empty when nothing is selected so the caller emits no change at all', () => {
    expect(collectClearSelectionIds([selectionNode('a'), selectionNode('b')])).toEqual([]);
  });
});

describe('collectSelectionConflictIds', () => {
  const container = selectionNode('loop', {
    flowNodeType: FlowNodeTypeEnum.loop,
    selected: true
  });
  const childA = selectionNode('child-a', { parentNodeId: 'loop', selected: true });
  const childB = selectionNode('child-b', { parentNodeId: 'loop', selected: true });
  const outside = selectionNode('outside', { selected: true });

  it('deselects selected children when a container is selected', () => {
    expect(
      collectSelectionConflictIds({ nodes: [container, childA, childB, outside], node: container })
    ).toEqual(['child-a', 'child-b']);
  });

  it('deselects the selected parent when a child is selected', () => {
    expect(collectSelectionConflictIds({ nodes: [container, childA], node: childA })).toEqual([
      'loop'
    ]);
  });

  it('returns empty when the parent is not selected', () => {
    const idleContainer = selectionNode('loop', { flowNodeType: FlowNodeTypeEnum.loop });
    expect(collectSelectionConflictIds({ nodes: [idleContainer, childA], node: childA })).toEqual(
      []
    );
  });

  it('returns empty for a top-level non-container node', () => {
    expect(collectSelectionConflictIds({ nodes: [container, outside], node: outside })).toEqual([]);
  });

  it('returns empty when a container has no selected child', () => {
    const idleChild = selectionNode('child-a', { parentNodeId: 'loop' });
    expect(collectSelectionConflictIds({ nodes: [container, idleChild], node: container })).toEqual(
      []
    );
  });
});

describe('canvas connection submission', () => {
  let root: Root;
  let controller: ReturnType<typeof useCanvasController>;

  beforeEach(() => {
    vi.clearAllMocks();
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    controllerState.runtime = hydrateRuntime({
      input: {
        nodes: [
          {
            nodeId: 'start',
            flowNodeType: FlowNodeTypeEnum.workflowStart,
            name: 'Start',
            inputs: [],
            outputs: []
          },
          {
            nodeId: 'target',
            flowNodeType: FlowNodeTypeEnum.textEditor,
            name: 'Target',
            inputs: [],
            outputs: []
          }
        ],
        edges: [],
        chatConfig: {}
      },
      t: ((key: string) => key) as never
    });
    controllerState.connectEdge.mockImplementation((edge) =>
      controllerState.runtime!.dispatch({ type: 'connectEdge', edge })
    );
    const Observer = () => {
      controller = useCanvasController({ helperLinesRef: { current: null } });
      return null;
    };
    root = createRoot(document.createElement('div'));
    act(() => root.render(React.createElement(Observer)));
  });

  afterEach(() => {
    act(() => root.unmount());
    controllerState.runtime?.dispose();
    controllerState.edges = [];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('removes legacy and current canvas edges together and restores them with one undo', async () => {
    const runtime = controllerState.runtime!;
    const edges = [
      {
        source: 'start',
        target: 'target',
        sourceHandle: 'start-source-top',
        targetHandle: 'target-target-right'
      },
      {
        source: 'start',
        target: 'target',
        sourceHandle: 'start-source-right',
        targetHandle: 'target-target-left'
      }
    ];
    expect(
      runtime.dispatch({
        type: 'replaceDocument',
        document: { ...runtime.getWorkflowData(), edges }
      }).ok
    ).toBe(true);
    controllerState.edges = projectRuntimeCanvas({
      runtime,
      overlays: {},
      localNodes: [],
      localEdges: [],
      cache: createProjectionCache()
    }).edges;
    expect(controllerState.edges[0]).toMatchObject(edges[1]);
    expect(controllerState.edges).toHaveLength(2);

    await act(async () => {
      controller.handleEdgeChange(controllerState.edges.map(({ id }) => ({ type: 'remove', id })));
    });
    expect(runtime.getWorkflowData().edges).toEqual([]);
    expect(runtime.undo().ok).toBe(true);
    expect(runtime.getWorkflowData().edges).toEqual(edges);
  });

  it('checks a submission once inside runtime without exporting the document', () => {
    const check = vi.spyOn(coreConnections, 'checkExecutionConnection');
    const exportDocument = vi.spyOn(controllerState.runtime!, 'getWorkflowData');
    const placement = vi.spyOn(controllerState.runtime!, 'getPlacementContext');
    const start = {
      nodeId: 'start',
      handleId: 'start-source-right',
      handleType: 'source' as const
    };
    act(() => controller.onConnectStart({} as MouseEvent, start));
    expect(controllerState.setConnectingEdge).toHaveBeenCalledWith(start);
    expect(placement).not.toHaveBeenCalled();
    act(() =>
      controller.customOnConnect({
        source: 'start',
        target: 'target',
        sourceHandle: 'start-source-right',
        targetHandle: 'target-target-left'
      })
    );
    expect(check).toHaveBeenCalledTimes(1);
    expect(exportDocument).not.toHaveBeenCalled();
    expect(controllerState.runtime!.getWorkflow().edges).toHaveLength(1);
    expect(controllerState.toast).not.toHaveBeenCalled();
  });

  it('renders the diagnostic returned by the failed runtime transaction', () => {
    const check = vi.spyOn(coreConnections, 'checkExecutionConnection');
    act(() =>
      controller.customOnConnect({
        source: 'start',
        target: 'target',
        sourceHandle: 'start-source-right',
        targetHandle: 'unsupported'
      })
    );
    expect(check).toHaveBeenCalledTimes(1);
    expect(controllerState.runtime!.getWorkflow().edges).toEqual([]);
    expect(controllerState.runtime!.getHistory().undoCount).toBe(0);
    expect(controllerState.toast).toHaveBeenCalledWith({
      status: 'warning',
      title: 'common:core.workflow.check.edge_handle_unsupported'
    });
  });
});
