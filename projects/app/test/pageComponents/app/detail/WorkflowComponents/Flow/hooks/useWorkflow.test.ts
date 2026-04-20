import { describe, expect, it, vi } from 'vitest';
import type { Node, NodePositionChange, XYPosition } from 'reactflow';

// Mock Markdown component: its CSS imports (katex) cannot be resolved under vitest.
// useWorkflow.tsx transitively imports AppContext -> Markdown.
vi.mock('@/components/Markdown', () => ({ default: () => null }));
vi.mock('katex/dist/katex.min.css', () => ({}));

import {
  createBoundedMaxHeap,
  collectNearestNodes,
  computeHelperLines,
  popoverWidth,
  popoverHeight
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useWorkflow';

// Helpers
const buildNode = (
  id: string,
  x: number,
  y: number,
  width = 50,
  height = 50,
  extra: Partial<Node> = {}
): Node => ({
  id,
  position: { x, y },
  data: {},
  width,
  height,
  ...extra
});

const buildPositionChange = (
  id: string,
  position: XYPosition | undefined,
  dragging = true
): NodePositionChange =>
  ({
    id,
    type: 'position',
    position,
    dragging
  }) as NodePositionChange;

describe('createBoundedMaxHeap', () => {
  it('should start empty', () => {
    const heap = createBoundedMaxHeap<string>(3);
    expect(heap.values()).toEqual([]);
  });

  it('should add items below capacity', () => {
    const heap = createBoundedMaxHeap<string>(3);
    heap.tryAdd('a', 10);
    heap.tryAdd('b', 5);
    const values = heap.values();
    expect(values).toHaveLength(2);
    expect(values).toContain('a');
    expect(values).toContain('b');
  });

  it('should fill to capacity and keep smaller keys when full', () => {
    const heap = createBoundedMaxHeap<string>(3);
    // add 3 at first
    heap.tryAdd('a', 10);
    heap.tryAdd('b', 20);
    heap.tryAdd('c', 5);
    // heap full; smaller key should replace root (max)
    heap.tryAdd('d', 1); // smallest, should replace max (b:20)
    const values = heap.values();
    expect(values).toHaveLength(3);
    expect(values).toContain('a');
    expect(values).toContain('c');
    expect(values).toContain('d');
    expect(values).not.toContain('b');
  });

  it('should ignore keys >= current max when heap is full', () => {
    const heap = createBoundedMaxHeap<string>(2);
    heap.tryAdd('a', 1);
    heap.tryAdd('b', 2);
    // max is 2; try with larger value - ignored
    heap.tryAdd('c', 3);
    const values = heap.values();
    expect(values).toHaveLength(2);
    expect(values).toContain('a');
    expect(values).toContain('b');
  });

  it('should handle equal keys against max (== not <) by ignoring', () => {
    const heap = createBoundedMaxHeap<string>(2);
    heap.tryAdd('a', 1);
    heap.tryAdd('b', 5);
    heap.tryAdd('c', 5); // equal to max, not strictly smaller
    const values = heap.values();
    expect(values).toHaveLength(2);
    expect(values).toContain('a');
    expect(values).toContain('b');
    expect(values).not.toContain('c');
  });

  it('should treat zero capacity as never accepting items', () => {
    const heap = createBoundedMaxHeap<string>(0);
    heap.tryAdd('a', 1);
    heap.tryAdd('b', 2);
    expect(heap.values()).toEqual([]);
  });

  it('should retain K smallest items from a large random dataset', () => {
    const heap = createBoundedMaxHeap<number>(5);
    const input = [9, 4, 7, 2, 11, 5, 1, 8, 3, 10, 6];
    for (const n of input) heap.tryAdd(n, n);
    const values = heap
      .values()
      .slice()
      .sort((a, b) => a - b);
    expect(values).toEqual([1, 2, 3, 4, 5]);
  });

  it('should keep heap property when inserting increasing sequence (siftUp)', () => {
    const heap = createBoundedMaxHeap<number>(4);
    // increasing keys - each insert sifts up
    for (let i = 1; i <= 4; i++) heap.tryAdd(i, i);
    expect(
      heap
        .values()
        .slice()
        .sort((a, b) => a - b)
    ).toEqual([1, 2, 3, 4]);
  });

  it('should keep heap property with replacements (siftDown both children)', () => {
    const heap = createBoundedMaxHeap<number>(3);
    heap.tryAdd(100, 100);
    heap.tryAdd(50, 50);
    heap.tryAdd(60, 60);
    // heap full, max=100. replace 100 with 10; siftDown through children
    heap.tryAdd(10, 10);
    // max now 60; replace with 20
    heap.tryAdd(20, 20);
    const sorted = heap
      .values()
      .slice()
      .sort((a, b) => a - b);
    expect(sorted).toEqual([10, 20, 50]);
  });

  it('should preserve siftDown when left child is not the largest', () => {
    const heap = createBoundedMaxHeap<number>(4);
    heap.tryAdd(10, 10);
    heap.tryAdd(8, 8);
    heap.tryAdd(30, 30);
    heap.tryAdd(6, 6);
    // fill heap, then replace max (30) with a smaller value; siftDown prefers right child
    heap.tryAdd(1, 1);
    const sorted = heap
      .values()
      .slice()
      .sort((a, b) => a - b);
    expect(sorted).toEqual([1, 6, 8, 10]);
  });
});

describe('collectNearestNodes', () => {
  it('should return empty on empty input', () => {
    expect(collectNearestNodes([], { x: 0, y: 0 }, 100, 5)).toEqual([]);
  });

  it('should filter out nodes whose dx or dy exceeds limit', () => {
    const dragPos = { x: 0, y: 0 };
    const nodes: Node[] = [
      buildNode('a', 10, 10), // within
      buildNode('b', 500, 0), // dx out
      buildNode('c', 0, 500), // dy out
      buildNode('d', 500, 500) // both out
    ];
    const result = collectNearestNodes(nodes, dragPos, 100, 5);
    expect(result.map((n) => n.id).sort()).toEqual(['a']);
  });

  it('should pick the K nearest by manhattan distance', () => {
    const dragPos = { x: 0, y: 0 };
    const nodes: Node[] = [
      buildNode('a', 1, 1), // 2
      buildNode('b', 5, 5), // 10
      buildNode('c', 3, 4), // 7
      buildNode('d', 10, 10), // 20
      buildNode('e', 2, 2) // 4
    ];
    const result = collectNearestNodes(nodes, dragPos, 1000, 3);
    const ids = result.map((n) => n.id).sort();
    // K=3 closest: a(2), e(4), c(7)
    expect(ids).toEqual(['a', 'c', 'e']);
  });

  it('should return all nodes when k >= input length', () => {
    const dragPos = { x: 0, y: 0 };
    const nodes: Node[] = [buildNode('a', 1, 1), buildNode('b', 2, 2)];
    const result = collectNearestNodes(nodes, dragPos, 1000, 10);
    expect(result.map((n) => n.id).sort()).toEqual(['a', 'b']);
  });

  it('should handle boundary limit: exactly equal dx or dy keeps node', () => {
    const dragPos = { x: 0, y: 0 };
    const nodes: Node[] = [
      buildNode('a', 100, 0), // dx = 100, exactly limit - kept
      buildNode('b', 101, 0) // dx > 100 - excluded
    ];
    const result = collectNearestNodes(nodes, dragPos, 100, 10);
    expect(result.map((n) => n.id)).toEqual(['a']);
  });

  it('should return empty when k=0', () => {
    const dragPos = { x: 0, y: 0 };
    const nodes: Node[] = [buildNode('a', 1, 1), buildNode('b', 2, 2)];
    expect(collectNearestNodes(nodes, dragPos, 1000, 0)).toEqual([]);
  });
});

describe('computeHelperLines', () => {
  it('should return default when change target node not found', () => {
    const change = buildPositionChange('missing', { x: 0, y: 0 });
    const nodes: Node[] = [buildNode('a', 0, 0)];
    const result = computeHelperLines(change, nodes);
    expect(result).toEqual({
      horizontal: undefined,
      vertical: undefined,
      snapPosition: { x: undefined, y: undefined }
    });
  });

  it('should return default when change.position is undefined', () => {
    const change = buildPositionChange('a', undefined);
    const nodes: Node[] = [buildNode('a', 0, 0)];
    const result = computeHelperLines(change, nodes);
    expect(result.horizontal).toBeUndefined();
    expect(result.vertical).toBeUndefined();
    expect(result.snapPosition).toEqual({ x: undefined, y: undefined });
  });

  it('should return initial value with only nodeA present (no reduce iterations)', () => {
    const change = buildPositionChange('a', { x: 0, y: 0 });
    const nodes: Node[] = [buildNode('a', 0, 0)];
    const result = computeHelperLines(change, nodes);
    expect(result.snapPosition).toEqual({ x: undefined, y: undefined });
    expect(result.horizontal).toBeUndefined();
    expect(result.vertical).toBeUndefined();
  });

  it('should fall back to 0 width/height when node has no size', () => {
    const change = buildPositionChange('a', { x: 0, y: 0 });
    // nodeA without width/height
    const nodeA: Node = { id: 'a', position: { x: 0, y: 0 }, data: {} } as any;
    const nodeB: Node = { id: 'b', position: { x: 0, y: 200 }, data: {} } as any;
    const result = computeHelperLines(change, [nodeA, nodeB]);
    // LL = |0 - 0| = 0, triggers vertical snap
    expect(result.snapPosition.x).toBe(0);
    // With zero widths, centerX = 0 for both -> also triggers CXCX equal branch
    expect(result.vertical).toBeDefined();
  });

  it('should snap Left-Left', () => {
    const change = buildPositionChange('a', { x: 0, y: 0 });
    const nodeA = buildNode('a', 0, 0, 50, 50);
    // nodeB with different width so R/LR/RL/CX won't equal LL=0
    const nodeB = buildNode('b', 0, 500, 100, 50);
    const result = computeHelperLines(change, [nodeA, nodeB]);
    expect(result.snapPosition.x).toBe(0);
    expect(result.vertical?.position).toBe(0);
    expect(result.horizontal?.nodes).toEqual([]);
  });

  it('should snap Right-Right (nodeBBounds.right - nodeABounds.width)', () => {
    const change = buildPositionChange('a', { x: 0, y: 0 });
    const nodeA = buildNode('a', 0, 0, 100, 50);
    // nodeB: right=100 (left=50,width=50), so RR=0; LL=50,LR=100,RL=50,CXCX=25 -> none match
    const nodeB = buildNode('b', 50, 500, 50, 50);
    const result = computeHelperLines(change, [nodeA, nodeB]);
    expect(result.snapPosition.x).toBe(0); // 100 - 100
    expect(result.vertical?.position).toBe(100);
  });

  it('should snap Left-Right', () => {
    const change = buildPositionChange('a', { x: 100, y: 0 });
    const nodeA = buildNode('a', 100, 0, 50, 50);
    // nodeB right = 100 (left=0,width=100); LR=0, LL=100, RR=50, RL=150, CXCX=75
    const nodeB = buildNode('b', 0, 500, 100, 50);
    const result = computeHelperLines(change, [nodeA, nodeB]);
    expect(result.snapPosition.x).toBe(100);
    expect(result.vertical?.position).toBe(100);
  });

  it('should snap Right-Left (nodeBBounds.left - nodeABounds.width)', () => {
    const change = buildPositionChange('a', { x: 0, y: 0 });
    const nodeA = buildNode('a', 0, 0, 100, 50);
    // nodeB: left=100; LL=100, RR=50, LR=150, RL=0, CXCX=25
    const nodeB = buildNode('b', 100, 500, 50, 50);
    const result = computeHelperLines(change, [nodeA, nodeB]);
    expect(result.snapPosition.x).toBe(0); // 100 - 100
    expect(result.vertical?.position).toBe(100);
  });

  it('should snap Top-Top', () => {
    const change = buildPositionChange('a', { x: 0, y: 0 });
    const nodeA = buildNode('a', 0, 0, 50, 50);
    // nodeB with different height so BB/BT/TB/CY don't match TT=0
    const nodeB = buildNode('b', 500, 0, 50, 100);
    const result = computeHelperLines(change, [nodeA, nodeB]);
    expect(result.snapPosition.y).toBe(0);
    expect(result.horizontal?.position).toBe(0);
  });

  it('should snap Bottom-Top (nodeBBounds.top - nodeABounds.height)', () => {
    const change = buildPositionChange('a', { x: 0, y: 0 });
    const nodeA = buildNode('a', 0, 0, 50, 100);
    const nodeB = buildNode('b', 500, 100, 50, 50);
    const result = computeHelperLines(change, [nodeA, nodeB]);
    expect(result.snapPosition.y).toBe(0); // 100 - 100
    expect(result.horizontal?.position).toBe(100);
  });

  it('should snap Bottom-Bottom', () => {
    const change = buildPositionChange('a', { x: 0, y: 50 });
    const nodeA = buildNode('a', 0, 50, 50, 100);
    // nodeB: top=0, bottom=150, centerY=75
    // TT=50, BT=150, BB=0, TB=100, CYCY=25
    const nodeB = buildNode('b', 500, 0, 50, 150);
    const result = computeHelperLines(change, [nodeA, nodeB]);
    expect(result.snapPosition.y).toBe(50); // 150 - 100
    expect(result.horizontal?.position).toBe(150);
  });

  it('should snap Top-Bottom', () => {
    const change = buildPositionChange('a', { x: 0, y: 100 });
    const nodeA = buildNode('a', 0, 100, 50, 50);
    // nodeB bottom=100 (top=0, height=100); TT=100, BT=150, BB=50, TB=0, CYCY=75
    const nodeB = buildNode('b', 500, 0, 50, 100);
    const result = computeHelperLines(change, [nodeA, nodeB]);
    expect(result.snapPosition.y).toBe(100);
    expect(result.horizontal?.position).toBe(100);
  });

  it('should snap CenterX-CenterX', () => {
    const change = buildPositionChange('a', { x: 0, y: 0 });
    const nodeA = buildNode('a', 0, 0, 100, 50); // centerX=50
    // nodeB: left=25, right=75, centerX=50; LL=25, RR=25, LR=75, RL=75, CXCX=0
    const nodeB = buildNode('b', 25, 500, 50, 50);
    const result = computeHelperLines(change, [nodeA, nodeB]);
    expect(result.snapPosition.x).toBe(0); // 50 - 50
    expect(result.vertical?.position).toBe(50);
  });

  it('should snap CenterY-CenterY', () => {
    const change = buildPositionChange('a', { x: 0, y: 0 });
    const nodeA = buildNode('a', 0, 0, 50, 100); // centerY=50
    // nodeB: top=25, bottom=75, centerY=50; TT=25, BT=75, BB=25, TB=75, CYCY=0
    const nodeB = buildNode('b', 500, 25, 50, 50);
    const result = computeHelperLines(change, [nodeA, nodeB]);
    expect(result.snapPosition.y).toBe(0); // 50 - 50
    expect(result.horizontal?.position).toBe(50);
  });

  it('should add additional nodes to vertical.nodes when LL equals current verticalDistance', () => {
    const change = buildPositionChange('a', { x: 0, y: 0 });
    const nodeA = buildNode('a', 0, 0, 50, 50);
    // Both B and C have left=0 (LL=0). C iteration will hit else-if.
    const nodeB = buildNode('b', 0, 500, 100, 50);
    const nodeC = buildNode('c', 0, 1000, 100, 50);
    const result = computeHelperLines(change, [nodeA, nodeB, nodeC]);
    expect(result.snapPosition.x).toBe(0);
    expect(result.vertical?.nodes.length).toBeGreaterThanOrEqual(3); // A + B + C at least
  });

  it('should add additional nodes to horizontal.nodes when TT equals current horizontalDistance', () => {
    const change = buildPositionChange('a', { x: 0, y: 0 });
    const nodeA = buildNode('a', 0, 0, 50, 50);
    // Two nodes with top=0, different heights so only TT triggers
    const nodeB = buildNode('b', 500, 0, 50, 100);
    const nodeC = buildNode('c', 1000, 0, 50, 100);
    const result = computeHelperLines(change, [nodeA, nodeB, nodeC]);
    expect(result.snapPosition.y).toBe(0);
    expect(result.horizontal?.nodes.length).toBeGreaterThanOrEqual(3);
  });

  it('should respect custom distance parameter (larger than default)', () => {
    const change = buildPositionChange('a', { x: 20, y: 0 });
    const nodeA = buildNode('a', 20, 0, 50, 50); // left=20, right=70, centerX=45
    // Width 200 separates all LL/RR/LR/RL/CXCX distances. Only LL=20 is small.
    const nodeB = buildNode('b', 0, 500, 200, 50); // left=0, right=200, centerX=100
    const noSnap = computeHelperLines(change, [nodeA, nodeB]);
    expect(noSnap.snapPosition.x).toBeUndefined();

    const change2 = buildPositionChange('a', { x: 20, y: 0 });
    const snap = computeHelperLines(change2, [nodeA, nodeB], 30);
    expect(snap.snapPosition.x).toBe(0);
  });

  it('should leave snapPosition unchanged when all distances exceed threshold', () => {
    const change = buildPositionChange('a', { x: 1000, y: 1000 });
    const nodeA = buildNode('a', 1000, 1000, 50, 50);
    const nodeB = buildNode('b', 0, 0, 50, 50);
    const result = computeHelperLines(change, [nodeA, nodeB]);
    expect(result.snapPosition.x).toBeUndefined();
    expect(result.snapPosition.y).toBeUndefined();
    // default vertical/horizontal from nodeABounds centers (set by first iteration)
    expect(result.vertical?.position).toBe(1025);
    expect(result.horizontal?.position).toBe(1025);
  });
});

describe('popover constants', () => {
  it('should expose expected popover dimensions', () => {
    expect(popoverWidth).toBe(400);
    expect(popoverHeight).toBe(600);
  });
});
