import { describe, expect, it } from 'vitest';
import {
  getNodeAncestorIds,
  getNodeDescendantIds
} from '@fastgpt/global/core/workflow/node/nesting';

const nodes = [
  { nodeId: 'loop' },
  { nodeId: 'loop-start', parentNodeId: 'loop' },
  { nodeId: 'parallel', parentNodeId: 'loop' },
  { nodeId: 'task', parentNodeId: 'parallel' },
  { nodeId: 'unrelated' }
];
const getNodeById = (id: string) => nodes.find((node) => node.nodeId === id);

describe('nested container traversal', () => {
  it('includes grandchildren when moving or deleting the outer container', () => {
    expect([...getNodeDescendantIds({ nodeId: 'loop', nodes })].sort()).toEqual([
      'loop-start',
      'parallel',
      'task'
    ]);
    expect([...getNodeDescendantIds({ nodeId: 'parallel', nodes })]).toEqual(['task']);
  });
  it('finds all ancestors for fold visibility and selection exclusion', () => {
    expect(getNodeAncestorIds({ nodeId: 'task', getNodeById })).toEqual(['parallel', 'loop']);
    expect(getNodeAncestorIds({ nodeId: 'loop', getNodeById })).toEqual([]);
  });
  it('terminates for cyclic imported graphs and never includes itself', () => {
    const cyclicNodes = [
      { nodeId: 'a', parentNodeId: 'b' },
      { nodeId: 'b', parentNodeId: 'a' }
    ];
    expect(
      getNodeAncestorIds({
        nodeId: 'a',
        getNodeById: (id) => cyclicNodes.find((n) => n.nodeId === id)
      })
    ).toEqual(['b']);
    expect([...getNodeDescendantIds({ nodeId: 'a', nodes: cyclicNodes })]).toEqual(['b']);
  });
});
