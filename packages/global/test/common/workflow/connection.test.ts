import { describe, expect, it } from 'vitest';
import { isToolWorkflowConnectionAllowed } from '@fastgpt/global/common/workflow/connection';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

describe('isToolWorkflowConnectionAllowed', () => {
  type Edge = Parameters<typeof isToolWorkflowConnectionAllowed>[0]['edges'][number];
  const normal = (source: string, target: string): Edge => ({ source, target });
  const tool = (source: string, target: string): Edge => ({
    source,
    target,
    targetHandle: NodeOutputKeyEnum.selectedTools
  });
  const edges = [
    normal('start', 'caller'),
    normal('caller', 'after'),
    tool('caller', 'tool-a'),
    normal('tool-a', 'a-tail'),
    tool('caller', 'tool-b'),
    normal('tool-b', 'b-tail'),
    normal('tool-a', 'nested-caller'),
    tool('nested-caller', 'inner-tool'),
    normal('inner-tool', 'inner-tail')
  ];
  const getNodeById = (nodeId: string) => ({
    flowNodeType: nodeId === 'start' ? FlowNodeTypeEnum.workflowStart : FlowNodeTypeEnum.chatNode
  });
  const allowed = (source: string, target: string, customEdges = edges) =>
    isToolWorkflowConnectionAllowed({
      source,
      target,
      edges: customEdges,
      isToolConnection: false,
      getNodeById
    });

  it.each([
    ['tool-a', 'a-tail', true],
    ['a-tail', 'nested-caller', true],
    ['inner-tool', 'inner-tail', true],
    ['a-tail', 'caller', false],
    ['a-tail', 'after', false],
    ['a-tail', 'start', false],
    ['after', 'a-tail', false],
    ['caller', 'a-tail', false],
    ['after', 'tool-a', false],
    ['after', 'inner-tail', false],
    ['a-tail', 'b-tail', false],
    ['b-tail', 'a-tail', false],
    ['a-tail', 'tool-b', false],
    ['inner-tail', 'nested-caller', false],
    ['inner-tail', 'caller', false],
    ['a-tail', 'new-node', true],
    ['new-node', 'a-tail', false],
    ['new-node', 'tool-a', false]
  ])('checks %s -> %s without changing the existing graph', (source, target, expected) => {
    const before = structuredClone(edges);
    expect(allowed(source, target)).toBe(expected);
    expect(edges).toEqual(before);
  });

  it('checks the entire connected fragment so an unassigned intermediate node cannot bypass isolation', () => {
    expect(allowed('a-tail', 'bridge', [...edges, normal('bridge', 'after')])).toBe(false);
    expect(allowed('a-tail', 'bridge', [...edges, normal('bridge', 'b-tail')])).toBe(false);
    expect(allowed('a-tail', 'bridge', [...edges, normal('bridge', 'free-tail')])).toBe(true);
    expect(allowed('bridge', 'a-tail', [...edges, normal('outside', 'bridge')])).toBe(false);
    expect(
      allowed('bridge', 'a-tail', [
        ...edges,
        normal('outside', 'bridge'),
        normal('bridge', 'a-tail'),
        normal('outside', 'a-tail')
      ])
    ).toBe(false);
  });

  it('rejects a return to detached callers and nested ancestors even without a main entry', () => {
    const detached = edges.filter((edge) => edge.source !== 'start');
    expect(allowed('a-tail', 'caller', detached)).toBe(false);
    expect(allowed('inner-tail', 'caller', detached)).toBe(false);
  });

  it('checks tool attachments too, regardless of which connection was created first', () => {
    const check = (source: string, target: string, customEdges = edges) =>
      isToolWorkflowConnectionAllowed({
        source,
        target,
        edges: customEdges,
        isToolConnection: true,
        getNodeById
      });
    expect(check('caller', 'new-tool')).toBe(true);
    expect(check('nested-caller', 'new-tool')).toBe(true);
    expect(check('caller', 'a-tail')).toBe(false);
    expect(check('caller', 'new-tool', [normal('new-tool', 'caller')])).toBe(false);
    expect(check('caller', 'after')).toBe(false);
  });

  it('supports plugin entry boundaries, ordinary cycles and incomplete historical edges', () => {
    expect(
      isToolWorkflowConnectionAllowed({
        source: 'a-tail',
        target: 'plugin-input',
        edges,
        isToolConnection: false,
        getNodeById: (nodeId) =>
          nodeId === 'plugin-input' ? { flowNodeType: FlowNodeTypeEnum.pluginInput } : undefined
      })
    ).toBe(false);
    expect(allowed('a-tail', 'new-node', [...edges, normal('inner-tail', 'inner-tool')])).toBe(
      true
    );
    expect(allowed('a-tail', 'new-node', [...edges, tool('nested-caller', 'leaf-tool')])).toBe(
      true
    );
    expect(allowed('free', 'other-free', [{ target: 'orphan' }])).toBe(true);
    expect(
      allowed('free', 'orphan-tool', [
        { target: 'orphan-tool', targetHandle: NodeOutputKeyEnum.selectedTools }
      ])
    ).toBe(false);
  });
});
