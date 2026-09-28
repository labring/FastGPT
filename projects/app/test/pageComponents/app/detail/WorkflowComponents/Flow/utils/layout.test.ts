import { describe, expect, it } from 'vitest';
import { getParentNodeSizeAndPosition } from '@/pageComponents/app/detail/WorkflowComponents/Flow/utils/layout';

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
  it('uses Dimension Index sizes for parent layout', () => {
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
      childWidth: 200,
      childHeight: 160,
      nodeWidth: 500,
      nodeHeight: 140
    });
  });
});
