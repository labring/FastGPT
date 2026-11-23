import { describe, expect, it } from 'vitest';
import {
  createWorkflowResourceContext,
  createSystemToolResourceContext,
  hasWorkflowResource,
  filterWorkflowToolList
} from '@fastgpt/service/core/workflow/dispatch/context/resource';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { createNode } from '../../utils';
import { createTestWorkflowFileContext, runWithTestWorkflowContext } from './fixtures';

describe('createWorkflowResourceContext / createSystemToolResourceContext', () => {
  it('系统工具提取真实资源并继承 root，但不继承团队；显式 root 覆盖优先', async () => {
    expect(createSystemToolResourceContext()).toMatchObject({
      isRoot: false,
      teamId: undefined,
      resourceMap: new Map()
    });
    const node = { ...createNode('nested', FlowNodeTypeEnum.appModule), pluginId: 'child-app' };
    await runWithTestWorkflowContext(
      {
        checkIsStopping: () => false,
        mcpClientMemory: {},
        fileContext: await createTestWorkflowFileContext(),
        resourceContext: createWorkflowResourceContext({
          resources: [],
          teamId: 'parent',
          isRoot: true
        })
      },
      () => {
        const child = createSystemToolResourceContext({ nodes: [node] });
        expect(child.isRoot).toBe(true);
        expect(child.teamId).toBeUndefined();
        expect([...child.resourceMap.values()]).toEqual([{ type: 'agent', id: 'child-app' }]);
        expect(hasWorkflowResource({ context: child, type: 'agent', id: 'child-app' })).toBe(true);
        expect(createWorkflowResourceContext({ resources: [], isRoot: false }).isRoot).toBe(false);
      }
    );
  });
});

describe('workflow resource snapshot selection', () => {
  it('distinguishes a selected child from a member-authorized child outside the snapshot', () => {
    const context = createWorkflowResourceContext({
      resources: [{ type: 'tool', id: 'set', data: { toolNames: ['selected'] } }]
    });
    expect(hasWorkflowResource({ context, type: 'tool', id: 'set', toolName: 'selected' })).toBe(
      true
    );
    expect(hasWorkflowResource({ context, type: 'tool', id: 'set', toolName: 'other' })).toBe(
      false
    );
    expect(
      filterWorkflowToolList({
        context,
        appId: 'set',
        tools: [{ name: 'selected' }, { name: 'other' }]
      })
    ).toEqual([{ name: 'selected' }]);
  });
  it('expands all children for an unrestricted set and has no snapshot authorization without context', () => {
    const context = createWorkflowResourceContext({ resources: [{ type: 'tool', id: 'set' }] });
    const tools = [{ name: 'one' }, { name: 'two' }];
    for (const input of [
      { context, appId: 'set' },
      { context, appId: 'missing' },
      { context: undefined, appId: 'set' }
    ]) {
      expect(filterWorkflowToolList({ ...input, tools })).toBe(tools);
    }
    expect(hasWorkflowResource({ context, type: 'tool', id: 'set', toolName: 'one' })).toBe(true);
    expect(hasWorkflowResource({ type: 'tool', id: 'set' })).toBe(false);
    expect(hasWorkflowResource({ context, type: 'tool', id: 'missing' })).toBe(false);
  });
});
