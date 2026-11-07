import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from 'reactflow';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
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
  revision: 1,
  setNodes: vi.fn(),
  getNodes: vi.fn(),
  getEdges: vi.fn(),
  fitView: vi.fn(),
  getParentNodeSizeAndPosition: vi.fn()
}));
vi.mock('reactflow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('reactflow')>()),
  useNodes: () => mocks.nodes,
  useNodesInitialized: () => mocks.initialized,
  useReactFlow: () => mocks
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext', () => ({
  WorkflowBufferDataContext: 'buffer'
}));
vi.mock('use-context-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('use-context-selector')>()),
  useContextSelector: (context: string, selector: (value: unknown) => unknown) =>
    selector(
      context === 'buffer'
        ? { setNodes: mocks.setNodes, workflowDataRevision: mocks.revision }
        : { getParentNodeSizeAndPosition: mocks.getParentNodeSizeAndPosition }
    )
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

  it('merges only positions and container dimensions into the latest data without resurrecting deleted nodes', () => {
    const parent = node('loop');
    parent.data.inputs = [
      { key: NodeInputKeyEnum.nodeWidth, value: 400, label: 'Width', renderTypeList: [] },
      { key: NodeInputKeyEnum.nodeHeight, value: 200, label: 'Height', renderTypeList: [] },
      { key: 'prompt', label: 'Prompt', value: 'latest prompt', renderTypeList: [] }
    ];
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
          position: { x: 20, y: 30 },
          data: {
            ...parent.data,
            inputs: parent.data.inputs.map((input) => ({
              ...input,
              value: input.key === NodeInputKeyEnum.nodeWidth ? 800 : 600
            }))
          }
        },
        { ...child, width: 999, position: { x: 50, y: 60 }, data: { ...child.data, name: 'old' } },
        node('deleted')
      ],
      resizedNodeIds: new Set(['loop'])
    });
    expect(result.map(({ id }) => id)).toEqual(['loop', 'child', 'new']);
    expect(result[0]).toMatchObject({ width: 900, height: 700, position: { x: 20, y: 30 } });
    expect(result[0].data.inputs.map(({ value }) => value)).toEqual([800, 600, 'latest prompt']);
    expect(result[0].data.inputs[0].label).toBe('Width');
    expect(result[1]).toMatchObject({ width: 420, data: { name: 'latest name' } });
    expect(result[1].position).toEqual({ x: 50, y: 60 });
    expect(result[1].data).toBe(child.data);
    expect(result[2]).toBe(added);
    expect(
      mergeWorkflowLayoutNodes({
        currentNodes: [added],
        layoutedNodes: [],
        resizedNodeIds: new Set()
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
        workflowDataRevision: mocks.revision
      });
    });
    return { result };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    frameId = 0;
    frames = new Map();
    mocks.nodes = [node('start'), node('answer'), node('isolated')];
    mocks.edges = [{ id: 'edge', source: 'start', target: 'answer' }];
    mocks.initialized = true;
    mocks.revision = 1;
    mocks.getNodes.mockImplementation(() => mocks.nodes);
    mocks.getEdges.mockImplementation(() => mocks.edges);
    mocks.setNodes.mockImplementation((update) => {
      mocks.nodes = typeof update === 'function' ? update(mocks.nodes) : update;
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
    expect(mocks.fitView).toHaveBeenCalledOnce();
  });

  it.each(['empty', 'unmeasured'] as const)('does not mutate a manual %s canvas', async (state) => {
    mocks.nodes = state === 'empty' ? [] : [node('start', { width: undefined })];
    await render();
    await expect(layout.autoLayout()).resolves.toBe('failed');
    expect(mocks.setNodes).not.toHaveBeenCalled();
    expect(mocks.fitView).not.toHaveBeenCalled();
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
    mocks.nodes = [node('start'), selection, node('second'), node('first')];
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
    mocks.nodes = [node('start'), loop, ...children];
    const original = structuredClone(mocks.nodes);
    mocks.edges = [
      { id: 'outer', source: 'start', target: 'loop' },
      { id: 'inner', source: 'child-start', target: 'child-answer' }
    ];
    let childLayout!: Node<FlowNodeItemType>[];
    mocks.getParentNodeSizeAndPosition.mockImplementationOnce(({ nodes, parentId }) => {
      expect(parentId).toBe('loop');
      childLayout = structuredClone(nodes);
      return {
        parentX: 80,
        parentY: 50,
        childWidth: 1000,
        childHeight: 500,
        nodeWidth: 1100,
        nodeHeight: 700
      };
    });
    await render();
    const result = layout.autoLayout();
    await frame();
    await frame();
    await expect(result).resolves.toBe('applied');
    const parent = mocks.nodes.find(({ id }) => id === 'loop')!;
    expect(parent).toMatchObject({ width: 1100, height: 700 });
    expect(parent.data.inputs.map(({ value }) => value)).toEqual([1000, 500]);
    for (const child of mocks.nodes.filter(({ data }) => data.parentNodeId === 'loop')) {
      const before = childLayout.find(({ id }) => id === child.id)!;
      expect(child.position).toEqual({
        x: before.position.x + parent.position.x - 80,
        y: before.position.y + parent.position.y - 50
      });
    }
    expect(childLayout[3].position.x).toBeGreaterThan(childLayout[2].position.x);
    expect(loop).toEqual(original[1]);
    expect(children).toEqual(original.slice(2));
  });

  it('stops a manual layout from focusing a replaced or unmounted canvas', async () => {
    await render();
    const replaced = layout.autoLayout();
    mocks.revision += 1;
    await render();
    await frame();
    await frame();
    await expect(replaced).resolves.toBe('failed');
    const unmounted = layout.autoLayout();
    await act(async () => root.render(null));
    await frame();
    await frame();
    await expect(unmounted).resolves.toBe('failed');
    expect(mocks.fitView).not.toHaveBeenCalled();
  });

  it('waits for initialization and two stable measured frames after the last resize', async () => {
    mocks.initialized = false;
    await render();
    const { result } = await request();
    await frame();
    expect(mocks.setNodes).not.toHaveBeenCalled();
    mocks.initialized = true;
    await render();
    await frame();
    mocks.nodes[1].height = undefined;
    await frame();
    mocks.nodes[1].height = 480;
    await frame();
    expect(mocks.setNodes).not.toHaveBeenCalled();
    await frame();
    expect(mocks.setNodes).toHaveBeenCalledOnce();
    await frame();
    await frame();
    await expect(result).resolves.toBe('applied');
    expect(mocks.fitView).toHaveBeenCalledOnce();
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
    expect(mocks.fitView).toHaveBeenCalledWith({
      nodes: [mocks.nodes[0], mocks.nodes[2]],
      padding: 0.3
    });
  });

  it.each(['revision', 'node set'] as const)(
    'rejects a stale %s request without moving the replacement canvas',
    async (changed) => {
      mocks.initialized = false;
      await render();
      const { result } = await request();
      if (changed === 'revision') mocks.revision += 1;
      else mocks.nodes = [node('replacement')];
      await render();
      await act(async () => vi.advanceTimersByTimeAsync(5000));
      await expect(result).resolves.toBe('failed');
      expect(mocks.setNodes).not.toHaveBeenCalled();
      expect(mocks.fitView).not.toHaveBeenCalled();
    }
  );

  it('cancels a stale revision while measuring without waiting for the fallback timeout', async () => {
    await render();
    const { result } = await request();
    mocks.revision += 1;
    await render();
    await frame();
    await expect(result).resolves.toBe('failed');
    expect(mocks.setNodes).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles a layout failure and clears its timeout so a later request can run', async () => {
    await render();
    mocks.setNodes.mockImplementationOnce(() => {
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
    'does not let an earlier in-flight layout complete a newer request or focus its canvas (revision changed: %s)',
    async (changeRevision) => {
      await render();
      const first = await request();
      await frame();
      await frame();
      expect(mocks.setNodes).toHaveBeenCalledOnce();

      if (changeRevision) mocks.revision += 1;
      mocks.initialized = false;
      mocks.nodes = [node('replacement')];
      await render();
      const second = await request();
      await expect(first.result).resolves.toBe('failed');
      const completed = vi.fn();
      void second.result.then(completed);
      await frame();
      await frame();
      expect(completed).not.toHaveBeenCalled();
      expect(mocks.fitView).not.toHaveBeenCalled();

      await act(async () => vi.advanceTimersByTimeAsync(5000));
      await frame();
      await frame();
      await expect(second.result).resolves.toBe('applied');
      expect(mocks.fitView).toHaveBeenCalledOnce();
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
      expect(mocks.fitView).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      expect(frames.size).toBe(0);
    }
  );
});
