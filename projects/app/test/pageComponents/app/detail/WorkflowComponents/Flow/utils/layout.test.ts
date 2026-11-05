import { describe, expect, it } from 'vitest';
import {
  CONTAINER_CHILD_PADDING,
  getParentNodeSizeAndPosition,
  normalizeContainerChildPositions
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/utils/layout';

const node = (id: string, parentNodeId?: string, x = 0, y = 0) =>
  ({
    id,
    position: { x, y },
    // ReactFlow compatibility fields intentionally disagree with the index.
    width: 1,
    height: 1,
    data: { nodeId: id, parentNodeId }
  }) as any;

describe('getParentNodeSizeAndPosition', () => {
  it('keeps 32px on every content edge and includes the card chrome in its full size', () => {
    const nodes = [
      node('parent', undefined, 100, 50),
      node('first', 'parent', 200, 150),
      node('last', 'parent', 600, 250)
    ];
    const layout = getParentNodeSizeAndPosition({
      nodes,
      parentId: 'parent',
      getNodeDimension: (nodeId) =>
        nodeId === 'parent' ? { width: 1466, height: 800 } : { width: 100, height: 80 },
      containerContentOffset: { x: 33, y: 100 },
      containerContentSize: { width: 1400, height: 600 }
    })!;

    const contentLeft = layout.parentX + 33;
    const contentTop = layout.parentY + 100;
    expect(200 - contentLeft).toBe(32);
    expect(150 - contentTop).toBe(32);
    expect(contentLeft + layout.childWidth - 700).toBe(32);
    expect(contentTop + layout.childHeight - 330).toBe(32);
    expect(layout.nodeWidth).toBe(layout.childWidth + 66);
    expect(layout.nodeHeight).toBe(layout.childHeight + 200);
    expect(layout.parentX + layout.nodeWidth).toBe(contentLeft + layout.childWidth + 33);

    nodes[0].position = { x: layout.parentX, y: layout.parentY };
    expect(
      getParentNodeSizeAndPosition({
        nodes,
        parentId: 'parent',
        getNodeDimension: (nodeId) =>
          nodeId === 'parent'
            ? { width: layout.nodeWidth, height: layout.nodeHeight }
            : { width: 100, height: 80 },
        containerContentOffset: { x: 33, y: 100 },
        containerContentSize: { width: layout.childWidth, height: layout.childHeight }
      })
    ).toMatchObject({
      parentX: layout.parentX,
      parentY: layout.parentY,
      nodeWidth: layout.nodeWidth,
      nodeHeight: layout.nodeHeight,
      positionDelta: { x: 0, y: 0 }
    });
  });

  it('recomputes parent size from child bounds instead of retaining stale dimensions', () => {
    const dimensions = new Map([
      ['parent', { width: 1200, height: 480 }],
      ['child', { width: 120, height: 80 }]
    ]);

    expect(
      getParentNodeSizeAndPosition({
        nodes: [node('parent'), node('child', 'parent', 10, 20)],
        parentId: 'parent',
        getNodeDimension: (nodeId) => dimensions.get(nodeId)
      })
    ).toMatchObject({
      childWidth: 120 + CONTAINER_CHILD_PADDING * 2,
      childHeight: 80 + CONTAINER_CHILD_PADDING * 2,
      nodeWidth: 120 + CONTAINER_CHILD_PADDING * 2,
      nodeHeight: 80 + CONTAINER_CHILD_PADDING * 2,
      positionDelta: { x: 0, y: 0 },
      folded: false
    });
  });

  it('does not preserve an oversized measured width after children move together', () => {
    expect(
      getParentNodeSizeAndPosition({
        nodes: [node('parent'), node('child', 'parent', 10, 20)],
        parentId: 'parent',
        getNodeDimension: (nodeId) =>
          nodeId === 'parent' ? { width: 1200, height: 480 } : { width: 120, height: 80 }
      })
    ).toMatchObject({
      childWidth: 120 + CONTAINER_CHILD_PADDING * 2,
      nodeWidth: 120 + CONTAINER_CHILD_PADDING * 2
    });
  });

  it('uses measured content for an empty container', () => {
    expect(
      getParentNodeSizeAndPosition({
        nodes: [node('parent')],
        parentId: 'parent',
        getNodeDimension: () => ({ width: 320, height: 180 })
      })
    ).toMatchObject({
      childWidth: 0,
      childHeight: 0,
      nodeWidth: 320,
      nodeHeight: 180,
      folded: false
    });
  });

  it('derives container size from children before the container itself is measured', () => {
    const child = node('child', 'parent', 100, 50);
    const sibling = node('sibling', 'parent', 600, 50);
    const getNodeDimension = (nodeId: string) =>
      nodeId === 'child' || nodeId === 'sibling' ? { width: 300, height: 200 } : undefined;

    expect(
      getParentNodeSizeAndPosition({
        nodes: [node('parent', undefined, 0, 0), child, sibling],
        parentId: 'parent',
        getNodeDimension
      })
    ).toMatchObject({
      childWidth: 800 + CONTAINER_CHILD_PADDING * 2,
      childHeight: 200 + CONTAINER_CHILD_PADDING * 2
    });
  });

  it('corrects the first measured position from the content origin', () => {
    const layout = getParentNodeSizeAndPosition({
      nodes: [node('parent', undefined, 200, 100), node('child', 'parent', 310, 240)],
      parentId: 'parent',
      getNodeDimension: (nodeId) =>
        nodeId === 'parent' ? { width: 300, height: 200 } : { width: 40, height: 30 },
      initialChildBounds: { left: 232, top: 132 }
    });

    expect(layout).toMatchObject({
      parentX: 278,
      parentY: 208,
      positionDelta: { x: 78, y: 108 }
    });
  });

  it('anchors the container from the measured content offset', () => {
    expect(
      getParentNodeSizeAndPosition({
        nodes: [node('parent', undefined, 100, 50), node('child', 'parent', 200, 150)],
        parentId: 'parent',
        getNodeDimension: (nodeId) =>
          nodeId === 'parent' ? { width: 300, height: 200 } : { width: 100, height: 100 },
        containerContentOffset: { x: 20, y: 100 }
      })
    ).toMatchObject({
      parentX: 148,
      parentY: 18
    });
  });

  it('adds padding around multiple direct children and follows bbox movement', () => {
    const dimensions = new Map([
      ['parent', { width: 300, height: 200 }],
      ['first', { width: 40, height: 30 }],
      ['second', { width: 20, height: 20 }]
    ]);
    const nodes = [
      node('parent', undefined, 100, 50),
      node('first', 'parent', -20, -10),
      node('second', 'parent', 100, 80)
    ];

    const firstLayout = getParentNodeSizeAndPosition({
      nodes,
      parentId: 'parent',
      getNodeDimension: (nodeId) => dimensions.get(nodeId)
    });
    expect(firstLayout).toMatchObject({
      childWidth: 140 + CONTAINER_CHILD_PADDING * 2,
      childHeight: 110 + CONTAINER_CHILD_PADDING * 2,
      childBounds: { left: -20, top: -10, right: 120, bottom: 100 },
      parentX: 100,
      parentY: 50
    });

    const movedNodes = [
      node('parent', undefined, 100, 50),
      node('first', 'parent', -10, -10),
      node('second', 'parent', 100, 80)
    ];
    expect(
      getParentNodeSizeAndPosition({
        nodes: movedNodes,
        parentId: 'parent',
        getNodeDimension: (nodeId) => dimensions.get(nodeId),
        previousChildBounds: firstLayout?.childBounds,
        previousParentPosition: { x: 100, y: 50 }
      })
    ).toMatchObject({
      parentX: 110,
      parentY: 50,
      positionDelta: { x: 10, y: 0 }
    });

    expect(
      getParentNodeSizeAndPosition({
        nodes: [
          node('parent', undefined, 110, 50),
          node('first', 'parent', -10, -10),
          node('second', 'parent', 110, 80)
        ],
        parentId: 'parent',
        getNodeDimension: (nodeId) => dimensions.get(nodeId),
        previousChildBounds: firstLayout?.childBounds,
        previousParentPosition: { x: 100, y: 50 }
      })
    ).toMatchObject({
      parentX: 110,
      parentY: 50,
      positionDelta: { x: 0, y: 0 }
    });

    expect(
      getParentNodeSizeAndPosition({
        nodes: [node('parent', undefined, 100, 50), node('first', 'parent', -20, -10)],
        parentId: 'parent',
        getNodeDimension: (nodeId) => dimensions.get(nodeId),
        previousChildBounds: {
          left: -20,
          top: -10,
          right: 20,
          bottom: 20,
          width: 40,
          height: 30
        },
        previousParentPosition: { x: 110, y: 50 }
      })
    ).toMatchObject({
      parentX: 110,
      parentY: 50,
      positionDelta: { x: 10, y: 0 }
    });

    expect(
      getParentNodeSizeAndPosition({
        nodes: [node('parent', undefined, 100, 50), node('first', 'parent', -10, -10)],
        parentId: 'parent',
        getNodeDimension: (nodeId) => dimensions.get(nodeId)
      })
    ).toMatchObject({
      childWidth: 40 + CONTAINER_CHILD_PADDING * 2,
      childHeight: 30 + CONTAINER_CHILD_PADDING * 2
    });
  });

  it('expands the container width and shifts its position when a child moves horizontally', () => {
    const dimensions = new Map([
      ['parent', { width: 300, height: 200 }],
      ['child', { width: 120, height: 80 }]
    ]);
    const parent = node('parent', undefined, 100, 50);
    const child = node('child', 'parent', 100, 20);

    expect(
      getParentNodeSizeAndPosition({
        nodes: [parent, child],
        parentId: 'parent',
        getNodeDimension: (nodeId) => dimensions.get(nodeId),
        previousChildBounds: {
          left: 132,
          top: 52,
          right: 252,
          bottom: 132,
          width: 120,
          height: 80
        },
        previousParentPosition: { x: 100, y: 50 }
      })
    ).toMatchObject({
      childWidth: 120 + CONTAINER_CHILD_PADDING * 2,
      parentX: 68,
      parentY: 18,
      positionDelta: { x: -32, y: -32 }
    });

    expect(
      getParentNodeSizeAndPosition({
        nodes: [parent, child, node('right-child', 'parent', 300, 20)],
        parentId: 'parent',
        getNodeDimension: (nodeId) =>
          nodeId === 'right-child' ? dimensions.get('child') : dimensions.get(nodeId),
        previousChildBounds: {
          left: 132,
          top: 52,
          right: 420,
          bottom: 132,
          width: 288,
          height: 80
        },
        previousParentPosition: { x: 100, y: 50 }
      })
    ).toMatchObject({
      childWidth: 320 + CONTAINER_CHILD_PADDING * 2,
      parentX: 68,
      positionDelta: { x: -32, y: -32 }
    });
  });

  it('keeps folded containers at their measured folded size', () => {
    const foldedParent = node('parent');
    foldedParent.data.isFolded = true;

    expect(
      getParentNodeSizeAndPosition({
        nodes: [foldedParent, node('child', 'parent', 10, 20)],
        parentId: 'parent',
        getNodeDimension: (nodeId) =>
          nodeId === 'parent' ? { width: 240, height: 240 } : { width: 100, height: 100 }
      })
    ).toMatchObject({
      childWidth: 0,
      childHeight: 0,
      nodeWidth: 240,
      nodeHeight: 240,
      folded: true
    });
  });

  it('normalizes new child positions to the padding origin', () => {
    const nodes = [
      node('parent'),
      node('first', 'parent', -20, -10),
      node('second', 'parent', 100, 80)
    ];
    normalizeContainerChildPositions({
      nodes,
      parentId: 'parent',
      bounds: { left: -20, top: -10, right: 120, bottom: 100, width: 140, height: 110 },
      targetOrigin: { left: 132, top: 82 }
    });

    expect(nodes[1]?.position).toEqual({
      x: 132,
      y: 82
    });
    expect(nodes[2]?.position).toEqual({ x: 252, y: 172 });
  });
});
