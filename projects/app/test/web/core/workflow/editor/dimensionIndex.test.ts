import { describe, expect, it } from 'vitest';
import {
  areNodeRectsIntersecting,
  classifyRenderableGraph,
  classifyViewportNodes,
  createDimensionBatcher,
  createMeasurementQueue,
  getDimensionedNodes,
  getLayoutDimension,
  getNodeRect,
  getViewportForNodeIds,
  type DimensionMeasurement
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/context/dimensionIndex';

const measuredDimension = (card: { width: number; height: number }, occupied = card) => ({
  card,
  occupied
});

describe('workflow dimension batcher', () => {
  it('commits only the latest measurement for each node in one frame', () => {
    const frames: Array<() => void> = [];
    const flushed: DimensionMeasurement[][] = [];
    const batcher = createDimensionBatcher({
      scheduler: {
        schedule: (callback) => {
          frames.push(callback);
          return frames.length;
        },
        cancel: () => {}
      },
      onFlush: (updates) => flushed.push(updates)
    });

    batcher.enqueue({
      nodeId: 'node-a',
      generation: 1,
      dimension: measuredDimension({ width: 100, height: 40 })
    });
    batcher.enqueue({
      nodeId: 'node-a',
      generation: 2,
      dimension: measuredDimension({ width: 120, height: 48 })
    });
    batcher.enqueue({
      nodeId: 'node-b',
      generation: 2,
      dimension: measuredDimension({ width: 200, height: 80 })
    });

    expect(frames).toHaveLength(1);
    expect(flushed).toEqual([]);

    frames[0]();

    expect(flushed).toEqual([
      [
        {
          nodeId: 'node-a',
          generation: 2,
          dimension: measuredDimension({ width: 120, height: 48 })
        },
        {
          nodeId: 'node-b',
          generation: 2,
          dimension: measuredDimension({ width: 200, height: 80 })
        }
      ]
    ]);
  });

  it('drops invalid or removed measurements before the frame commits', () => {
    const frames: Array<() => void> = [];
    const flushed: DimensionMeasurement[][] = [];
    const batcher = createDimensionBatcher({
      scheduler: {
        schedule: (callback) => {
          frames.push(callback);
          return frames.length;
        },
        cancel: () => {}
      },
      onFlush: (updates) => flushed.push(updates)
    });

    batcher.enqueue({
      nodeId: 'invalid',
      generation: 1,
      dimension: measuredDimension({ width: Number.NaN, height: 40 })
    });
    batcher.enqueue({
      nodeId: 'removed',
      generation: 1,
      dimension: measuredDimension({ width: 100, height: 40 })
    });
    batcher.remove('removed');

    frames[0]();

    expect(flushed).toEqual([]);
  });
});

describe('workflow dimension geometry', () => {
  it('keeps layout dimensions in canvas pixels when the viewport is zoomed', () => {
    expect(getLayoutDimension({ offsetWidth: 666, offsetHeight: 1296 })).toEqual({
      width: 666,
      height: 1296
    });
  });

  it('derives rectangles and filters nodes without an index entry', () => {
    const first = { id: 'first', position: { x: 10, y: 20 } };
    const second = { id: 'second', position: { x: 50, y: 30 } };
    const firstRect = getNodeRect(first, { width: 100, height: 60 });
    const secondRect = getNodeRect(second, { width: 80, height: 40 });

    expect(firstRect).toMatchObject({ right: 110, bottom: 80, centerX: 60, centerY: 50 });
    expect(areNodeRectsIntersecting(firstRect!, secondRect!)).toBe(true);
    expect(
      getDimensionedNodes([first, second], (nodeId) =>
        nodeId === 'first' ? { width: 100, height: 60 } : undefined
      )
    ).toEqual([{ ...first, width: 100, height: 60 }]);
  });
});

describe('workflow viewport measurement scheduling', () => {
  it('classifies viewport and safety-zone nodes and keeps their parents full', () => {
    const result = classifyViewportNodes({
      viewport: { x: 0, y: 0, zoom: 1, width: 100, height: 100 },
      dimensions: new Map(),
      nodes: [
        { id: 'visible', position: { x: 10, y: 10 } },
        { id: 'parent', position: { x: 500, y: 0 } },
        { id: 'child', parentNodeId: 'parent', position: { x: -490, y: 10 } },
        { id: 'overscan', position: { x: 290, y: 10 } },
        { id: 'far', position: { x: 1000, y: 10 } }
      ]
    });

    expect(result.visibleNodeIds).toEqual(new Set(['visible', 'child']));
    expect(result.overscanNodeIds).toEqual(new Set(['overscan']));
    expect(result.fullNodeIds).toEqual(new Set(['visible', 'child', 'parent', 'overscan']));
    expect(result.priorities.get('far')).toBe(2);
  });

  it('uses occupied dimensions for viewport classification', () => {
    const result = classifyViewportNodes({
      viewport: { x: 0, y: 0, zoom: 1, width: 100, height: 100 },
      dimensions: new Map([
        ['issue-node', measuredDimension({ width: 80, height: 40 }, { width: 80, height: 140 })]
      ]),
      nodes: [{ id: 'issue-node', position: { x: 10, y: -130 } }]
    });

    expect(result.visibleNodeIds).toEqual(new Set(['issue-node']));
  });

  it('keeps focused nodes full even outside the viewport', () => {
    const result = classifyViewportNodes({
      viewport: { x: 0, y: 0, zoom: 1, width: 100, height: 100 },
      dimensions: new Map(),
      nodes: [{ id: 'focused', position: { x: 1000, y: 1000 }, focusPinned: true }]
    });

    expect(result.fullNodeIds).toEqual(new Set(['focused']));
  });

  it('deduplicates queue entries, preserves generation, and limits batches', () => {
    const queue = createMeasurementQueue();
    queue.upsert({ nodeId: 'far', generation: 1, priority: 2 });
    queue.upsert({ nodeId: 'near', generation: 1, priority: 1 });
    queue.upsert({ nodeId: 'visible', generation: 1, priority: 0 });
    queue.upsert({ nodeId: 'visible', generation: 2, priority: 0 });
    queue.upsert({ nodeId: 'visible', generation: 1, priority: 2 });

    expect(queue.take(2)).toEqual([
      { nodeId: 'visible', generation: 2, priority: 0 },
      { nodeId: 'near', generation: 1, priority: 1 }
    ]);
    expect(queue.take(8)).toEqual([{ nodeId: 'far', generation: 1, priority: 2 }]);
    expect(queue.getSize()).toBe(0);
  });
});

describe('workflow viewport fitting', () => {
  it('fits selected nodes from absolute positions instead of the rendered subset', () => {
    const viewport = getViewportForNodeIds({
      width: 1000,
      height: 500,
      padding: 0,
      nodes: [
        { id: 'parent', position: { x: 100, y: 50 } },
        { id: 'child', parentNodeId: 'parent', position: { x: 200, y: 100 } }
      ],
      nodeIds: ['child'],
      dimensions: new Map([['child', measuredDimension({ width: 600, height: 300 })]])
    });

    expect(viewport?.zoom).toBeCloseTo(5 / 3);
    expect(viewport?.x).toBeCloseTo(-500);
    expect(viewport?.y).toBeCloseTo(-250);
  });

  it('excludes folded descendants and returns no viewport without measured targets', () => {
    const dimensions = new Map([
      ['parent', measuredDimension({ width: 100, height: 100 })],
      ['child', measuredDimension({ width: 500, height: 500 })]
    ]);
    const nodes = [
      { id: 'parent', position: { x: 10, y: 20 }, isFolded: true },
      { id: 'child', parentNodeId: 'parent', position: { x: 300, y: 300 } }
    ];

    expect(
      getViewportForNodeIds({
        width: 1000,
        height: 500,
        padding: 0,
        nodes,
        dimensions
      })
    ).toEqual({ x: 320, y: 40, zoom: 3 });
    expect(
      getViewportForNodeIds({
        width: 1000,
        height: 500,
        nodes,
        nodeIds: ['missing'],
        dimensions
      })
    ).toBeUndefined();
  });
});

describe('workflow render graph classification', () => {
  const dimension = measuredDimension({ width: 20, height: 20 });

  it('keeps visible nodes, connected endpoints, and drops disconnected far nodes and edges', () => {
    const result = classifyRenderableGraph({
      viewport: { x: 0, y: 0, zoom: 1, width: 100, height: 100 },
      overscan: 20,
      dimensions: new Map([
        ['visible', dimension],
        ['connected', dimension],
        ['far-a', dimension],
        ['far-b', dimension]
      ]),
      nodes: [
        { id: 'visible', position: { x: 10, y: 10 } },
        { id: 'connected', position: { x: 150, y: 10 } },
        { id: 'far-a', position: { x: 1000, y: 10 } },
        { id: 'far-b', position: { x: 1100, y: 10 } }
      ],
      edges: [
        { id: 'connected-edge', source: 'visible', target: 'connected' },
        { id: 'far-edge', source: 'far-a', target: 'far-b' }
      ]
    });

    expect(result.renderedNodeIds).toEqual(new Set(['visible', 'connected']));
    expect(result.renderedEdgeIds).toEqual(new Set(['connected-edge']));
  });

  it('keeps an edge and both endpoints when its endpoint bounds reach the safety range', () => {
    const result = classifyRenderableGraph({
      viewport: { x: 0, y: 0, zoom: 1, width: 100, height: 100 },
      overscan: 50,
      dimensions: new Map([
        ['near-end', dimension],
        ['far-end', dimension]
      ]),
      nodes: [
        { id: 'near-end', position: { x: 130, y: 20 } },
        { id: 'far-end', position: { x: 300, y: 20 } }
      ],
      edges: [{ id: 'safety-edge', source: 'near-end', target: 'far-end' }]
    });

    expect(result.renderedNodeIds).toEqual(new Set(['near-end', 'far-end']));
    expect(result.renderedEdgeIds).toEqual(new Set(['safety-edge']));
  });

  it('renders all descendants and internal edges when a container is visible', () => {
    const result = classifyRenderableGraph({
      viewport: { x: 0, y: 0, zoom: 1, width: 100, height: 100 },
      overscan: 20,
      dimensions: new Map([
        ['parent', measuredDimension({ width: 80, height: 80 })],
        ['child-a', dimension],
        ['child-b', dimension]
      ]),
      nodes: [
        { id: 'parent', position: { x: 10, y: 10 }, isFolded: false },
        { id: 'child-a', parentNodeId: 'parent', position: { x: 10, y: 10 } },
        { id: 'child-b', parentNodeId: 'parent', position: { x: 500, y: 500 } }
      ],
      edges: [{ id: 'internal-edge', source: 'child-a', target: 'child-b' }]
    });

    expect(result.renderedNodeIds).toEqual(new Set(['parent', 'child-a', 'child-b']));
    expect(result.fullNodeIds).toEqual(new Set(['parent', 'child-a', 'child-b']));
    expect(result.renderedEdgeIds).toEqual(new Set(['internal-edge']));
  });
});
