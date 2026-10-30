import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { WorkflowSnapshot } from '@fastgpt/global/core/workflow/editor/types';
import {
  matchesWorkflowAutoLayoutRequest,
  getWorkflowAutoLayoutNodeSizeSignature,
  mergeWorkflowLayoutNodes,
  useWorkflowAutoLayout
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useWorkflowAutoLayout';

const mocks = vi.hoisted(() => ({
  nodes: [] as Node<FlowNodeItemType>[],
  edges: [] as Edge[],
  initialized: true,
  workflowSnapshot: {} as WorkflowSnapshot,
  replaceNodes: vi.fn(),
  commitGeometry: vi.fn(),
  getNodes: vi.fn(),
  getEdges: vi.fn(),
  fitNodes: vi.fn(),
  getNodeDimension: vi.fn()
}));
vi.mock('@xyflow/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@xyflow/react')>()),
  useNodes: () => mocks.nodes,
  useNodesInitialized: () => mocks.initialized
}));
vi.mock('@/web/core/workflow/editor/react/useWorkflow', () => ({
  useWorkflowActions: () => ({ commitGeometry: mocks.commitGeometry })
}));
vi.mock('@/web/core/workflow/editor/session/workflowSession', () => ({
  useWorkflowRuntime: () => ({ getWorkflow: () => mocks.workflowSnapshot, isDisposed: () => false }),
  useWorkflowSnapshot: () => mocks.workflowSnapshot
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/canvas/workflowCanvasContext', () => ({
  useWorkflowCanvasRendererValue: (selector: (value: unknown) => unknown) =>
    selector({ getNodes: mocks.getNodes, edges: mocks.edges, replaceNodes: mocks.replaceNodes }),
  useWorkflowCanvasValue: (selector: (value: unknown) => unknown) =>
    selector({ fitNodes: mocks.fitNodes, getNodeDimension: mocks.getNodeDimension })
}));

const node = (id: string, extra: Partial<Node<FlowNodeItemType>> = {}): Node<FlowNodeItemType> => ({
  id,
  position: { x: 100, y: 200 },
  width: 420,
  height: 240,
  data: {
    id,
    nodeId: id,
    name: id,
    intro: '',
    avatar: '',
    flowNodeType: id === 'start' ? FlowNodeTypeEnum.workflowStart : FlowNodeTypeEnum.answerNode,
    inputs: [],
    outputs: []
  },
  ...extra
});

const setCanvasNodes = (nodes: Node<FlowNodeItemType>[]) => {
  mocks.nodes = nodes;
  mocks.workflowSnapshot = {
    nodes: nodes.map(({ data }) => ({ ...data, issues: [] })),
    edges: [],
    chatConfig: {}
  } as unknown as WorkflowSnapshot;
};

describe('workflow layout data compatibility', () => {
  it('binds auto-layout readiness to the exact Builder-applied node set', () => {
    const nodes = [node('start'), node('answer')];

    expect(
      matchesWorkflowAutoLayoutRequest({
        nodes,
        nodeIds: new Set(['start', 'answer'])
      })
    ).toBe(true);
    expect(
      matchesWorkflowAutoLayoutRequest({
        nodes,
        nodeIds: new Set(['start', 'old-node'])
      })
    ).toBe(false);
  });

  it('waits for the complete measured node set and ignores node ordering in its size signature', () => {
    const nodes = [node('start'), node('answer', { height: 360 })];
    const nodeIds = new Set(nodes.map(({ id }) => id));
    const signature = getWorkflowAutoLayoutNodeSizeSignature({ nodes, nodeIds });
    expect(signature).toBe('answer:420:360|start:420:240');
    expect(getWorkflowAutoLayoutNodeSizeSignature({ nodes: [...nodes].reverse(), nodeIds })).toBe(
      signature
    );
    expect(
      getWorkflowAutoLayoutNodeSizeSignature({ nodes: nodes.slice(1), nodeIds })
    ).toBeUndefined();
    expect(
      getWorkflowAutoLayoutNodeSizeSignature({
        nodes: [nodes[0], { ...nodes[1], height: undefined }],
        nodeIds
      })
    ).toBeUndefined();
  });

  it('merges layout coordinates into current projection without restoring deleted nodes', () => {
    const parent = node('loop');
    const child = node('child');
    child.data.name = 'latest name';
    const added = node('new');
    const result = mergeWorkflowLayoutNodes({
      currentNodes: [parent, child, added],
      layoutedNodes: [
        {
          ...parent,
          width: 900,
          height: 700,
          position: { x: 20, y: 30 }
        },
        { ...child, width: 999, position: { x: 50, y: 60 }, data: { ...child.data, name: 'old' } },
        node('deleted')
      ]
    });
    expect(result.map(({ id }) => id)).toEqual(['loop', 'child', 'new']);
    expect(result[0]).toMatchObject({ width: 420, height: 240, position: { x: 20, y: 30 } });
    expect(result[1]).toMatchObject({ width: 420, data: { name: 'latest name' } });
    expect(result[1].position).toEqual({ x: 50, y: 60 });
    expect(result[1].data).toBe(child.data);
    expect(result[2]).toBe(added);
    expect(
      mergeWorkflowLayoutNodes({
        currentNodes: [added],
        layoutedNodes: []
      })[0]
    ).toBe(added);
    expect(parent.width).toBe(420);
    expect(child.position).toEqual({ x: 100, y: 200 });
  });
});

describe('useWorkflowAutoLayout', () => {
  let dom: JSDOM;
  let root: Root;
  let layout: ReturnType<typeof useWorkflowAutoLayout>;
  let frames: Map<number, FrameRequestCallback>;
  let frameId: number;
  const Harness = () => {
    layout = useWorkflowAutoLayout();
    return null;
  };
  const render = async () => act(async () => root.render(createElement(Harness)));
  const frame = async () => {
    await act(async () => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(0));
    });
  };
  const request = async () => {
    let result!: ReturnType<typeof layout.requestAutoLayout>;
    await act(async () => {
      result = layout.requestAutoLayout({
        nodeIds: mocks.nodes.map(({ id }) => id),
        workflowSnapshot: mocks.workflowSnapshot
      });
    });
    return { result };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    frameId = 0;
    frames = new Map();
    setCanvasNodes([node('start'), node('answer'), node('isolated')]);
    mocks.edges = [{ id: 'edge', source: 'start', target: 'answer' }];
    mocks.initialized = true;
    mocks.getNodes.mockImplementation(() => mocks.nodes);
    mocks.getEdges.mockImplementation(() => mocks.edges);
    mocks.replaceNodes.mockImplementation((nodes) => {
      mocks.nodes = nodes as Node<FlowNodeItemType>[];
    });
    mocks.fitNodes.mockReturnValue(true);
    mocks.getNodeDimension.mockImplementation((nodeId) => {
      const current = mocks.nodes.find(({ id }) => id === nodeId);
      return current?.width && current?.height
        ? { width: current.width, height: current.height }
        : undefined;
    });
    dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(dom.window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.spyOn(dom.window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id));
    root = createRoot(document.getElementById('root')!);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps manual layout anchored at the entry and preserves disconnected nodes and input data', async () => {
    await render();
    const original = structuredClone(mocks.nodes);
    const result = layout.autoLayout();
    await frame();
    await frame();
    await expect(result).resolves.toBe('applied');
    expect(mocks.nodes[0].position).toEqual(original[0].position);
    expect(mocks.nodes[1].position.x).toBeGreaterThan(mocks.nodes[0].position.x);
    expect(mocks.nodes[2]).toEqual(original[2]);
    expect(mocks.nodes.map(({ data }) => data)).toEqual(original.map(({ data }) => data));
    expect(mocks.fitNodes).toHaveBeenCalledOnce();
  });

  it.each(['empty', 'unmeasured'] as const)('does not mutate a manual %s canvas', async (state) => {
    setCanvasNodes(state === 'empty' ? [] : [node('start', { width: undefined })]);
    await render();
    await expect(layout.autoLayout()).resolves.toBe('failed');
    expect(mocks.replaceNodes).not.toHaveBeenCalled();
    expect(mocks.fitNodes).not.toHaveBeenCalled();
  });

  it('keeps user-selection branches in option order when laying out an ordinary canvas', async () => {
    const selection = node('selection');
    selection.data.flowNodeType = FlowNodeTypeEnum.userSelect;
    selection.data.inputs = [
      {
        key: NodeInputKeyEnum.userSelectOptions,
        label: 'Options',
        renderTypeList: [],
        value: [
          { key: 'first-option', value: 'First' },
          { key: 'second-option', value: 'Second' }
        ]
      }
    ];
    setCanvasNodes([node('start'), selection, node('second'), node('first')]);
    mocks.edges = [
      { id: 'entry', source: 'start', target: 'selection' },
      { id: 'second', source: 'selection', target: 'second', sourceHandle: 'second-option' },
      { id: 'first', source: 'selection', target: 'first', sourceHandle: 'first-option' }
    ];
    await render();
    const result = layout.autoLayout();
    await frame();
    await frame();
    await expect(result).resolves.toBe('applied');
    expect(mocks.nodes.find(({ id }) => id === 'first')!.position.y).toBeLessThan(
      mocks.nodes.find(({ id }) => id === 'second')!.position.y
    );
  });

  it('lays out loop children inside the container and moves them together with their resized parent', async () => {
    const loop = node('loop');
    loop.data.flowNodeType = FlowNodeTypeEnum.loopRun;
    loop.data.inputs = [
      { key: NodeInputKeyEnum.nodeWidth, label: 'Width', value: 400, renderTypeList: [] },
      { key: NodeInputKeyEnum.nodeHeight, label: 'Height', value: 200, renderTypeList: [] }
    ];
    const children = [node('child-start'), node('child-answer')];
    children.forEach((child) => {
      child.data.parentNodeId = 'loop';
    });
    setCanvasNodes([node('start'), loop, ...children]);
    const original = structuredClone(mocks.nodes);
    mocks.edges = [
      { id: 'outer', source: 'start', target: 'loop' },
      { id: 'inner', source: 'child-start', target: 'child-answer' }
    ];
    const originalChildPositions = new Map(
      children.map((child) => [child.id, { ...child.position }])
    );
    await render();
    const result = layout.autoLayout();
    await frame();
    await frame();
    await expect(result).resolves.toBe('applied');
    const parent = mocks.nodes.find(({ id }) => id === 'loop')!;
    expect(parent.width).toBe(420);
    expect(parent.height).toBe(240);
    for (const child of mocks.nodes.filter(({ data }) => data.parentNodeId === 'loop')) {
      expect(child.position).not.toEqual(originalChildPositions.get(child.id));
    }
    expect(loop).toEqual(original[1]);
    expect(children).toEqual(original.slice(2));
    expect(mocks.commitGeometry).toHaveBeenCalledOnce();
  });

  it('stops a manual layout from focusing a replaced or unmounted canvas', async () => {
    await render();
    const replaced = layout.autoLayout();
    setCanvasNodes(mocks.nodes);
    await render();
    await frame();
    await frame();
    await expect(replaced).resolves.toBe('failed');
    const unmounted = layout.autoLayout();
    await act(async () => root.render(null));
    await frame();
    await frame();
    await expect(unmounted).resolves.toBe('failed');
    expect(mocks.fitNodes).not.toHaveBeenCalled();
  });

  it('waits for initialization and two stable measured frames after the last resize', async () => {
    mocks.initialized = false;
    await render();
    const { result } = await request();
    await frame();
    expect(mocks.replaceNodes).not.toHaveBeenCalled();
    mocks.initialized = true;
    await render();
    await frame();
    mocks.nodes[1].height = undefined;
    await frame();
    mocks.nodes[1].height = 480;
    await frame();
    expect(mocks.replaceNodes).not.toHaveBeenCalled();
    await frame();
    expect(mocks.replaceNodes).toHaveBeenCalledOnce();
    await frame();
    await frame();
    await expect(result).resolves.toBe('applied');
    expect(mocks.fitNodes).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back after the initialization timeout without persisting fake measurements', async () => {
    mocks.nodes[1].width = undefined;
    mocks.nodes[1].height = undefined;
    mocks.initialized = false;
    await render();
    const { result } = await request();
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    await frame();
    await frame();
    await expect(result).resolves.toBe('degraded');
    expect(mocks.nodes[1].width).toBeUndefined();
    expect(mocks.nodes[1].height).toBeUndefined();
    expect(mocks.fitNodes).toHaveBeenCalledWith(['start', 'isolated'], { padding: 0.3 });
  });

  it.each(['workflow snapshot', 'node set'] as const)(
    'rejects a stale %s request without moving the replacement canvas',
    async (changed) => {
      mocks.initialized = false;
      await render();
      const { result } = await request();
      if (changed === 'workflow snapshot') mocks.workflowSnapshot = {} as WorkflowSnapshot;
      else mocks.nodes = [node('replacement')];
      await render();
      await act(async () => vi.advanceTimersByTimeAsync(5000));
      await expect(result).resolves.toBe('failed');
      expect(mocks.replaceNodes).not.toHaveBeenCalled();
      expect(mocks.fitNodes).not.toHaveBeenCalled();
    }
  );

  it('cancels a stale workflow snapshot while measuring without fallback timeout', async () => {
    await render();
    const { result } = await request();
    mocks.workflowSnapshot = {} as WorkflowSnapshot;
    await render();
    await frame();
    await expect(result).resolves.toBe('failed');
    expect(mocks.replaceNodes).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles a layout failure and clears its timeout so a later request can run', async () => {
    await render();
    mocks.replaceNodes.mockImplementationOnce(() => {
      throw new Error('Canvas unavailable');
    });
    const { result } = await request();
    await frame();
    await frame();
    await expect(result).resolves.toBe('failed');
    expect(vi.getTimerCount()).toBe(0);
    const retry = await request();
    for (let i = 0; i < 4; i += 1) await frame();
    await expect(retry.result).resolves.toBe('applied');
  });

  it.each([false, true])(
    'does not let an earlier in-flight layout complete a newer request or focus its canvas (snapshot changed: %s)',
    async (changeRevision) => {
      await render();
      const first = await request();
      await frame();
      await frame();
      expect(mocks.replaceNodes).toHaveBeenCalledOnce();

      mocks.initialized = false;
      const previousWorkflowSnapshot = mocks.workflowSnapshot;
      setCanvasNodes([node('replacement')]);
      if (!changeRevision) mocks.workflowSnapshot = previousWorkflowSnapshot;
      await render();
      const second = await request();
      await expect(first.result).resolves.toBe('failed');
      const completed = vi.fn();
      void second.result.then(completed);
      await frame();
      await frame();
      expect(completed).not.toHaveBeenCalled();
      expect(mocks.fitNodes).not.toHaveBeenCalled();

      await act(async () => vi.advanceTimersByTimeAsync(5000));
      await frame();
      await frame();
      await expect(second.result).resolves.toBe('applied');
      expect(mocks.fitNodes).toHaveBeenCalledOnce();
    }
  );

  it.each([false, true])(
    'cancels a pending request on unmount (already running: %s)',
    async (running) => {
      await render();
      const { result } = await request();
      if (running) {
        await frame();
        await frame();
      }
      await act(async () => root.render(null));
      await expect(result).resolves.toBe('failed');
      await frame();
      await frame();
      expect(mocks.fitNodes).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      expect(frames.size).toBe(0);
    }
  );
});
