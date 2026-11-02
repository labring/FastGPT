import { describe, expect, it } from 'vitest';
import { ToolCallChildrenInteractiveSchema } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import {
  createAgentLoopCoreChildInteractiveParams,
  createWorkflowToolInteractive
} from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/interactive/child';

const childrenResponse = {
  type: 'userSelect' as const,
  params: { description: 'Choose', userSelectOptions: [{ key: 'a', value: 'A' }] },
  entryNodeIds: ['select'],
  memoryEdges: [],
  nodeOutputs: []
};

describe('agentLoopCore child interactive', () => {
  it('writes only the flat parent call ID and preserves the child workflow', () => {
    expect(createWorkflowToolInteractive({ toolCallId: 'call_tool' })).toBeUndefined();
    const interactive = createWorkflowToolInteractive({
      toolCallId: 'call_tool',
      interactive: childrenResponse
    });
    expect(interactive?.params).toEqual({ toolCallId: 'call_tool', childrenResponse });
    expect(createAgentLoopCoreChildInteractiveParams({ lastInteractive: interactive })).toEqual({
      toolCallId: 'call_tool',
      childrenResponse
    });
  });

  it.each([
    { toolCallId: 'call_tool' },
    {
      toolParams: {
        toolCallId: 'call_tool',
        memoryRequestMessages: [{ role: 'user', content: 'Obsolete snapshot' }]
      }
    },
    { toolCallId: 'call_tool', toolParams: { toolCallId: 'obsolete-call' } }
  ])('normalizes new/legacy payloads without retaining old fields: %j', (parentParams) => {
    const interactive = {
      type: 'toolChildrenInteractive',
      params: { ...parentParams, childrenResponse }
    };
    const before = structuredClone(interactive);
    expect(ToolCallChildrenInteractiveSchema.parse(interactive)).toEqual({
      type: 'toolChildrenInteractive',
      params: { toolCallId: 'call_tool', childrenResponse }
    });
    expect(
      createAgentLoopCoreChildInteractiveParams({ lastInteractive: interactive as any })
    ).toEqual({ toolCallId: 'call_tool', childrenResponse });
    expect(interactive).toEqual(before);
  });

  it.each([
    undefined,
    { type: 'userSelect', params: childrenResponse.params },
    { type: 'toolChildrenInteractive' },
    { type: 'toolChildrenInteractive', params: null },
    { type: 'toolChildrenInteractive', params: { childrenResponse } },
    { type: 'toolChildrenInteractive', params: { childrenResponse, toolParams: null } },
    { type: 'toolChildrenInteractive', params: { childrenResponse, toolParams: {} } },
    { type: 'toolChildrenInteractive', params: { childrenResponse, toolCallId: 42 } },
    {
      type: 'toolChildrenInteractive',
      params: { childrenResponse, toolCallId: '', toolParams: { toolCallId: 'obsolete-call' } }
    }
  ])('safely skips unrelated or malformed records: %j', (interactive) => {
    expect(
      createAgentLoopCoreChildInteractiveParams({ lastInteractive: interactive as any })
    ).toBeUndefined();
  });
});
