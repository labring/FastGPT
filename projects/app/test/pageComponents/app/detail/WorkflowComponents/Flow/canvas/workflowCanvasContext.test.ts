import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Edge } from '@xyflow/react';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { CanvasNode } from '@/web/core/workflow/editor/canvas/canvasTypes';
import WorkflowCanvasProvider, {
  useWorkflowCanvasRendererValue,
  useWorkflowCanvasValue
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/canvas/workflowCanvasContext';
import type {
  DimensionRegistration,
  NodeDimensions
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/canvas/nodeDimensions';
import * as layout from '@/pageComponents/app/detail/WorkflowComponents/Flow/utils/layout';

const mocks = vi.hoisted(() => ({
  nodes: [] as CanvasNode[],
  edges: [] as Edge[],
  structureKeys: new Map<string, string>(),
  cardHeights: new Map<string, number>(),
  nodesInitialized: false,
  getNodesBounds: vi.fn(() => ({ x: 0, y: 0, width: 30, height: 30 })),
  setViewport: vi.fn(async () => true),
  replaceDocument: () => {},
  reprojectNodes: () => {},
  runtime: {
    isDisposed: () => false,
    subscribe: (listener: (change: { kind: 'replace' | 'geometry' }) => void) => {
      mocks.replaceDocument = () => listener({ kind: 'replace' });
      mocks.reprojectNodes = () => listener({ kind: 'geometry' });
      return () => {};
    },
    getNode: () => undefined
  },
  overlaysRef: { current: {} },
  issueFocusRef: { current: undefined }
}));
vi.mock('@xyflow/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@xyflow/react')>()),
  useNodesInitialized: () => mocks.nodesInitialized,
  useStore: (selector: (state: { width: number; height: number }) => unknown) =>
    selector({ width: 100, height: 100 }),
  useStoreApi: () => ({ getState: () => ({ minZoom: 0.1, maxZoom: 2 }) }),
  useReactFlow: () => ({
    getNode: (nodeId: string) => mocks.nodes.find(({ id }) => id === nodeId),
    getNodesBounds: mocks.getNodesBounds,
    setViewport: mocks.setViewport
  })
}));
vi.mock('@/web/core/workflow/editor/session/workflowSession', () => ({
  useWorkflowRuntime: () => mocks.runtime,
  useWorkflowViewTick: () => 0,
  useWorkflowOverlayRef: () => mocks.overlaysRef,
  useWorkflowIssueFocusRef: () => mocks.issueFocusRef
}));
vi.mock('@/web/core/workflow/editor/canvas/projectWorkflowCanvas', () => ({
  createProjectionCache: () => ({ nodes: new Map<string, { structureKey: string }>() }),
  projectRuntimeCanvas: ({
    cache
  }: {
    cache: { nodes: Map<string, { structureKey: string }> };
  }) => {
    for (const [id, structureKey] of mocks.structureKeys) cache.nodes.set(id, { structureKey });
    return { nodes: mocks.nodes, edges: mocks.edges };
  }
}));

describe('workflow canvas measurements', () => {
  let dom: JSDOM;
  let root: Root;
  let frames: Map<number, FrameRequestCallback>;
  let dimensions: ReadonlyMap<string, NodeDimensions>;
  let containerLayouts: ReadonlyMap<string, layout.ParentNodeLayout>;
  let registerNodeMeasurement: (nodeId: string) => DimensionRegistration;
  let getNodeDimensions: (nodeId: string) => NodeDimensions | undefined;
  let renderedIds: string[];
  let renderedNodes: CanvasNode[];
  let renderedEdges: Edge[];
  let renderModes: ReadonlyMap<string, string>;
  let fitNodes: (nodeIds?: string[]) => boolean;
  let requestNodeMeasurements: (nodeIds: ReadonlySet<string>) => () => void;
  let focusNodes: (nodeIds: string[]) => void;
  let cancelPendingViewport: () => void;
  let pinNodeFocus: (nodeId: string) => void;
  let unpinNodeFocus: (nodeId: string) => void;
  let applyNodeChanges: (changes: import('@xyflow/react').NodeChange<CanvasNode>[]) => void;

  const Measurement = ({ nodeId }: { nodeId: string }) => {
    const register = useWorkflowCanvasValue((value) => value.registerNodeMeasurement);
    useEffect(() => {
      const registration = register(nodeId);
      const height = mocks.cardHeights.get(nodeId) ?? 400;
      registration.report({
        card: { width: 366, height },
        occupied: { width: 366, height },
        containerContentOffset: { x: 33, y: 100 },
        containerContentSize: { width: 300, height: 200 }
      });
      return registration.dispose;
    }, [nodeId, register]);
    return null;
  };
  const Harness = () => {
    dimensions = useWorkflowCanvasValue((value) => value.nodeDimensions);
    containerLayouts = useWorkflowCanvasValue((value) => value.containerLayouts);
    registerNodeMeasurement = useWorkflowCanvasValue((value) => value.registerNodeMeasurement);
    getNodeDimensions = useWorkflowCanvasValue((value) => value.getNodeDimensions);
    renderModes = useWorkflowCanvasValue((value) => value.renderModes);
    fitNodes = useWorkflowCanvasValue((value) => value.fitNodes);
    requestNodeMeasurements = useWorkflowCanvasValue((value) => value.requestNodeMeasurements);
    focusNodes = useWorkflowCanvasValue((value) => value.focusNodes);
    cancelPendingViewport = useWorkflowCanvasValue((value) => value.cancelPendingViewport);
    pinNodeFocus = useWorkflowCanvasValue((value) => value.pinNodeFocus);
    unpinNodeFocus = useWorkflowCanvasValue((value) => value.unpinNodeFocus);
    applyNodeChanges = useWorkflowCanvasRendererValue((value) => value.applyNodeChanges);
    const nodes = useWorkflowCanvasRendererValue((value) => value.renderedNodes);
    renderedNodes = nodes;
    renderedEdges = useWorkflowCanvasRendererValue((value) => value.renderedEdges);
    renderedIds = nodes.map(({ id }) => id);
    return createElement(
      'div',
      null,
      ...nodes
        .filter(({ id }) => renderModes.get(id) !== 'shell')
        .map(({ id }) => createElement(Measurement, { key: id, nodeId: id }))
    );
  };
  const render = async () =>
    act(async () =>
      root.render(createElement(WorkflowCanvasProvider, null, createElement(Harness)))
    );
  const flushFrame = async () =>
    act(async () => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(0));
    });
  const node = (id: string, parentNodeId?: string): CanvasNode => ({
    id,
    type: parentNodeId ? FlowNodeTypeEnum.answerNode : FlowNodeTypeEnum.loopRun,
    position: { x: 10000, y: 10000 },
    data: {
      nodeId: id,
      parentNodeId,
      name: id,
      intro: '',
      avatar: '',
      flowNodeType: parentNodeId ? FlowNodeTypeEnum.answerNode : FlowNodeTypeEnum.loopRun
    }
  });

  it('uses a fresh measurement for both the parent card and the content box', async () => {
    const id = 'first-container';
    await render();
    await flushFrame();
    expect(containerLayouts.get(id)?.nodeWidth).toBe(496);

    const card = { width: 520, height: 540 };
    await act(async () =>
      registerNodeMeasurement(id).report({
        card,
        occupied: card,
        containerContentOffset: { x: 33, y: 100 },
        containerContentSize: { width: 430, height: 464 }
      })
    );
    await flushFrame();

    expect(containerLayouts.get(id)).toMatchObject({ nodeWidth: 520, nodeHeight: 540 });
  });

  beforeEach(() => {
    mocks.edges = [];
    mocks.structureKeys.clear();
    mocks.cardHeights.clear();
    mocks.nodesInitialized = false;
    mocks.getNodesBounds.mockClear();
    mocks.setViewport.mockClear();
    dom = new JSDOM('<!doctype html><div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    frames = new Map();
    let frameId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    root = createRoot(document.getElementById('root')!);
    mocks.nodes = [
      node('first-container'),
      node('first-child', 'first-container'),
      node('second-container'),
      node('second-child', 'second-container'),
      { ...node('folded-container'), data: { ...node('folded-container').data, isFolded: true } },
      node('folded-child', 'folded-container')
    ];
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('skips unrelated containers on a root drag and recalculates only the moved child’s parent', async () => {
    const ordinary = node('ordinary');
    mocks.nodes.push({
      ...ordinary,
      type: FlowNodeTypeEnum.answerNode,
      data: { ...ordinary.data, flowNodeType: FlowNodeTypeEnum.answerNode }
    });
    await render();
    await flushFrame();

    const measure = vi.spyOn(layout, 'getParentNodeSizeAndPosition');
    try {
      await act(async () => {
        applyNodeChanges([{ type: 'position', id: 'ordinary', position: { x: 20, y: 30 } }]);
      });
      expect(measure).not.toHaveBeenCalled();

      await act(async () => {
        applyNodeChanges([{ type: 'position', id: 'first-child', position: { x: 30, y: 40 } }]);
      });
      expect(measure.mock.calls.map(([input]) => input.parent.id)).toEqual(['first-container']);
      expect(measure.mock.calls[0][0].childNodes.map(({ id }) => id)).toEqual(['first-child']);
    } finally {
      measure.mockRestore();
    }
  });

  it.each([50, 51])(
    'measures every offscreen container only in full mode (%i nodes)',
    async (count) => {
      while (mocks.nodes.length < count) {
        mocks.nodes.push(node(`filler-${mocks.nodes.length}`, 'first-container'));
      }
      await render();
      await flushFrame();

      if (count === 50) {
        expect(renderedIds).toHaveLength(49);
        for (const id of [
          'first-container',
          'first-child',
          'second-container',
          'second-child',
          'folded-container'
        ]) {
          expect(dimensions.get(id)?.containerContentOffset).toEqual({ x: 33, y: 100 });
          expect(dimensions.get(id)?.containerContentSize).toEqual({ width: 300, height: 200 });
        }
      } else {
        expect(renderedIds).toEqual([]);
        expect(dimensions.size).toBe(0);
      }
      expect(renderedIds).not.toContain('folded-child');
      expect(dimensions.has('folded-child')).toBe(false);
    }
  );

  it('keeps an offscreen editor mounted long enough for its blur commit and cancels release on refocus', async () => {
    mocks.nodes = Array.from({ length: 51 }, (_, index) => node(`node-${index}`));
    await render();
    await flushFrame();

    await act(async () => pinNodeFocus('node-0'));
    expect(renderedIds).toEqual(['node-0']);

    await act(async () => {
      unpinNodeFocus('node-0');
      pinNodeFocus('node-0');
    });
    await flushFrame();
    expect(renderedIds).toEqual(['node-0']);

    const commit = vi.fn(() => expect(renderModes.get('node-0')).toBe('full'));
    await act(async () => {
      requestAnimationFrame(commit);
      unpinNodeFocus('node-0');
    });
    expect(renderedIds).toEqual(['node-0']);
    await flushFrame();
    expect(commit).toHaveBeenCalledOnce();
    expect(renderedIds).toEqual([]);
  });

  it('keeps all visible edges while measuring at most eight offscreen endpoints', async () => {
    const source = { ...node('source'), position: { x: 0, y: 0 } };
    const targets = Array.from({ length: 50 }, (_, index) => node(`target-${index}`));
    mocks.nodes = [source, ...targets];
    mocks.edges = targets.map(({ id }) => ({ id: `edge-${id}`, source: source.id, target: id }));

    await render();
    expect(renderModes.get(source.id)).toBe('full');
    expect([...renderModes.values()].filter((mode) => mode === 'shell')).toHaveLength(50);
    expect(renderedEdges).toHaveLength(50);

    let mostActive = 0;
    for (let frame = 0; frame < 25 && dimensions.size < 51; frame++) {
      await flushFrame();
      mostActive = Math.max(
        mostActive,
        [...renderModes.values()].filter((mode) => mode === 'measurement').length
      );
      expect(renderedEdges).toHaveLength(50);
      expect(renderedIds).toHaveLength(51);
      expect(mostActive).toBeLessThanOrEqual(8);
    }
    expect(mostActive).toBe(8);
    expect(dimensions.size).toBe(51);
    expect([...renderModes.values()].filter((mode) => mode === 'shell')).toHaveLength(50);
  });

  it('measures an explicitly fitted offscreen container even without visible edges', async () => {
    while (mocks.nodes.length < 51) mocks.nodes.push(node(`filler-${mocks.nodes.length}`));
    await render();
    await act(async () => expect(fitNodes(['second-container'])).toBe(false));
    for (let frame = 0; frame < 4 && !dimensions.has('second-container'); frame++) {
      await flushFrame();
    }

    expect(dimensions.get('second-container')?.card).toEqual({ width: 366, height: 400 });
    expect(dimensions.has('folded-child')).toBe(false);
    expect(mocks.setViewport).toHaveBeenCalledOnce();
  });

  it.each([6, 51])(
    'measures the requested %i-node layout without fitting the viewport',
    async (size) => {
      while (mocks.nodes.length < size) mocks.nodes.push(node(`filler-${mocks.nodes.length}`));
      mocks.cardHeights.set('folded-child', 555);
      await render();
      await flushFrame();
      expect(getNodeDimensions('folded-child')).toBeUndefined();
      const release = requestNodeMeasurements(new Set(mocks.nodes.map(({ id }) => id)));
      for (let frame = 0; frame < 25 && dimensions.size < size; frame++) {
        await flushFrame();
        expect(
          [...renderModes.values()].filter((mode) => mode === 'measurement').length
        ).toBeLessThanOrEqual(8);
      }
      expect(dimensions.size).toBe(size);
      expect(getNodeDimensions('folded-child')?.card.height).toBe(555);
      release();
      await flushFrame();
      expect(renderedIds).not.toContain('folded-child');
      expect(mocks.setViewport).not.toHaveBeenCalled();
    }
  );

  it('focuses the visible folded ancestor of a hidden target', async () => {
    const inner = node('folded-inner', 'folded-container');
    inner.data.isFolded = true;
    mocks.nodes.push(inner, node('hidden-target', inner.id));
    while (mocks.nodes.length < 51) mocks.nodes.push(node(`filler-${mocks.nodes.length}`));
    mocks.nodesInitialized = true;
    await render();
    await act(async () => focusNodes(['hidden-target', 'folded-child']));
    for (let frame = 0; frame < 5 && !mocks.setViewport.mock.calls.length; frame++) {
      await flushFrame();
    }

    expect(mocks.getNodesBounds).toHaveBeenCalledExactlyOnceWith(['folded-container']);
    expect(mocks.setViewport).toHaveBeenCalledOnce();
    expect(renderedIds).not.toContain('hidden-target');
  });

  it('keeps a later fit request when initial node focus is waiting for the canvas', async () => {
    await render();
    await act(async () => {
      focusNodes(['first-container']);
      fitNodes();
    });

    mocks.nodesInitialized = true;
    await render();
    await flushFrame();
    await flushFrame();

    expect(mocks.setViewport).toHaveBeenCalledOnce();
    expect(mocks.getNodesBounds).not.toHaveBeenCalled();
  });

  it('lets a manual viewport gesture cancel a fit pending offscreen measurements', async () => {
    while (mocks.nodes.length < 75) mocks.nodes.push(node(`filler-${mocks.nodes.length}`));
    await render();
    await act(async () => expect(fitNodes()).toBe(false));
    await flushFrame();
    cancelPendingViewport();
    for (let frame = 0; frame < 25; frame++) await flushFrame();
    expect(mocks.setViewport).not.toHaveBeenCalled();
  });

  it('cancels a pending full fit when a later request focuses on one node', async () => {
    mocks.nodesInitialized = true;
    await render();
    await act(async () => {
      fitNodes();
      focusNodes(['first-container']);
    });
    await flushFrame();
    await flushFrame();

    expect(mocks.getNodesBounds).toHaveBeenCalledWith(['first-container']);
    expect(mocks.setViewport).toHaveBeenCalledExactlyOnceWith({ x: 20, y: 20, zoom: 2 });
  });

  it('remeasures offscreen nodes after output structure changes with the same canvas data', async () => {
    const id = 'first-child';
    const fitOffscreenNode = async () => {
      await act(async () => expect(fitNodes([id])).toBe(false));
      for (let frame = 0; frame < 6 && !getNodeDimensions(id); frame++) {
        await flushFrame();
      }
    };
    while (mocks.nodes.length < 51) mocks.nodes.push(node(`filler-${mocks.nodes.length}`));
    mocks.structureKeys.set(id, 'one output');
    await render();
    await fitOffscreenNode();
    expect(getNodeDimensions(id)?.card.height).toBe(400);
    expect(renderedIds).not.toContain(id);

    // 只有用于显示的 overlay 变化时，离屏尺寸仍可复用。
    mocks.nodes = mocks.nodes.map((item) =>
      item.id === id ? { ...item, data: { ...item.data, searchedText: 'query' } } : item
    );
    await act(async () => mocks.reprojectNodes());
    expect(getNodeDimensions(id)?.card.height).toBe(400);

    // 输出结构变化后投影换了对象，但 data 中仍只有辅助字段。
    mocks.nodes = mocks.nodes.map((item) =>
      item.id === id ? { ...item, data: { ...item.data } } : item
    );
    mocks.structureKeys.set(id, 'two outputs');
    mocks.cardHeights.set(id, 470);
    await act(async () => mocks.reprojectNodes());

    expect(getNodeDimensions(id)).toBeUndefined();
    await fitOffscreenNode();
    expect(getNodeDimensions(id)?.card.height).toBe(470);
  });

  it('remeasures a same-id offscreen node after replacing document values', async () => {
    const id = 'first-child';
    while (mocks.nodes.length < 51) mocks.nodes.push(node(`filler-${mocks.nodes.length}`));
    await render();
    await act(async () => expect(fitNodes([id])).toBe(false));
    for (let frame = 0; frame < 6 && !getNodeDimensions(id); frame++) await flushFrame();
    expect(getNodeDimensions(id)?.card.height).toBe(400);
    expect(renderedIds).not.toContain(id);

    mocks.cardHeights.set(id, 720);
    await act(async () => mocks.replaceDocument());
    expect(getNodeDimensions(id)).toBeUndefined();
    await act(async () => expect(fitNodes([id])).toBe(false));
    for (let frame = 0; frame < 6 && !getNodeDimensions(id); frame++) await flushFrame();
    expect(getNodeDimensions(id)?.card.height).toBe(720);
  });

  it('preserves imported child coordinates through measurement and reprojection', async () => {
    await render();
    await flushFrame();

    const firstPosition = { x: 500, y: 560 };
    const secondPosition = { x: 900, y: 680 };
    mocks.nodes = [
      { ...node('imported-container'), position: { x: 100, y: 200 } },
      { ...node('imported-first', 'imported-container'), position: firstPosition },
      { ...node('imported-second', 'imported-container'), position: secondPosition }
    ];
    await act(async () => mocks.replaceDocument());
    await flushFrame();

    const getPosition = (id: string) => renderedNodes.find((node) => node.id === id)?.position;
    expect(getPosition('imported-first')).toEqual(firstPosition);
    expect(getPosition('imported-second')).toEqual(secondPosition);

    await act(async () => mocks.replaceDocument());
    expect(getPosition('imported-first')).toEqual(firstPosition);
    expect(getPosition('imported-second')).toEqual(secondPosition);
  });
});
