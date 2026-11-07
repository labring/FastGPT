import { describe, expect, it } from 'vitest';
import {
  createWorkflowResourceContext,
  hasWorkflowResource,
  filterWorkflowToolList
} from '@fastgpt/service/core/workflow/resource/context';

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
    expect(filterWorkflowToolList({ context, appId: 'set', tools })).toEqual(tools);
    expect(hasWorkflowResource({ type: 'tool', id: 'set' })).toBe(false);
    expect(hasWorkflowResource({ context, type: 'tool', id: 'missing' })).toBe(false);
  });
});
