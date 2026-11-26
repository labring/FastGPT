import { describe, expect, it, vi } from 'vitest';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

vi.mock('@/web/core/workflow/editor/session/workflowSession', async () => {
  return { useWorkflowOverlayActions: () => vi.fn() };
});

vi.mock('@/pageComponents/app/detail/context', async () => {
  const { createContext } = await import('use-context-selector');
  return { AppContext: createContext({}) };
});

vi.mock('@/web/core/workflow/api', () => ({
  postWorkflowDebug: vi.fn()
}));

vi.mock('@/components/core/chat/ChatContainer/context/workflowRuntimeContext', () => ({
  WorkflowRuntimeContextProvider: ({ children }: { children: unknown }) => children
}));

import {
  createNextWorkflowDebugData,
  createWorkflowDebugData,
  getWorkflowDebugNodeStatus,
  getWorkflowDebugRuntimeContext
} from '@/pageComponents/app/detail/WorkflowComponents/debug/workflowDebugSession';
import { resolveDebugStep } from '@/web/core/workflow/editor/debug/workflowDebugOverlay';

const runtimeNodes = [
  { nodeId: 'entry-node', inputs: [] },
  { nodeId: 'next-node', inputs: [] }
] as any;

describe('getWorkflowDebugNodeStatus', () => {
  it('marks execution errors as failed, including errors captured by a branch', () => {
    expect(
      getWorkflowDebugNodeStatus({
        nodeId: 'mcp',
        type: 'run',
        response: { errorText: 'MCP isError', errorCaptured: true } as any
      })
    ).toBe('failed');
    expect(
      getWorkflowDebugNodeStatus({
        nodeId: 'http',
        type: 'run',
        response: { error: 'HTTP 500' } as any
      })
    ).toBe('failed');
  });

  it('keeps skipped nodes skipped and does not interpret tool result data as node errors', () => {
    expect(
      getWorkflowDebugNodeStatus({
        nodeId: 'skipped',
        type: 'skip',
        response: { errorText: 'stale error' } as any
      })
    ).toBe('skipped');
    expect(
      getWorkflowDebugNodeStatus({
        nodeId: 'ok',
        type: 'run',
        response: { toolRes: { error: 'ordinary business data' } } as any
      })
    ).toBe('success');
    expect(getWorkflowDebugNodeStatus({ nodeId: 'empty', type: 'run' })).toBe('success');
  });
});

describe('resolveDebugStep', () => {
  it('shows captured run errors as failed overlays', () => {
    const result = resolveDebugStep({
      writtenNodeIds: [],
      selectedNodeIds: [],
      entryNodeIds: ['mcp'],
      nodeResponses: {
        mcp: {
          type: 'run',
          response: { errorText: 'captured MCP error' } as any
        }
      }
    });

    expect(result.overlayPatches[0]?.values.debugResult).toEqual(
      expect.objectContaining({ status: 'failed' })
    );
  });
});

describe('getWorkflowDebugRuntimeContext', () => {
  it('uses draft upload mode and exposes the generated debug chatId', () => {
    expect(
      getWorkflowDebugRuntimeContext({ appId: 'app-id', chatId: 'debug-session-chat-id' })
    ).toEqual({
      sourceTarget: { sourceType: 'app', sourceId: 'app-id' },
      chatId: 'debug-session-chat-id',
      outLinkAuthData: undefined,
      fileUploadMode: 'draft'
    });
  });

  it('uses an empty chatId before the debug modal creates a session', () => {
    expect(getWorkflowDebugRuntimeContext({ appId: 'app-id' }).chatId).toBe('');
  });
});

describe('createWorkflowDebugData', () => {
  it('marks saved references in the request without changing the document or debug literals', () => {
    const reference = {
      key: 'ref',
      label: 'Reference',
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      value: ['removed', 'result']
    };
    const literal = { ...reference, value: ['first', 'second'], debugValueOverride: true };
    const result = createWorkflowDebugData({
      params: {
        entryNodeId: 'entry-node',
        runtimeNodes: [
          { ...runtimeNodes[0], inputs: [literal] },
          { ...runtimeNodes[1], inputs: [reference] }
        ],
        runtimeEdges: [],
        variables: {}
      }
    });
    expect(result.runtimeNodes.map(({ inputs }) => inputs[0])).toEqual([
      literal,
      { ...reference, debugValueOverride: false }
    ]);
    expect(reference).not.toHaveProperty('debugValueOverride');
  });

  it('uses the modal chatId for the first debug run', () => {
    const result = createWorkflowDebugData({
      params: {
        entryNodeId: 'entry-node',
        runtimeNodes,
        runtimeEdges: [],
        variables: { input: 'value' }
      },
      defaultChatId: 'debug-session-chat-id'
    });

    expect(result).toEqual(
      expect.objectContaining({
        entryNodeIds: ['entry-node'],
        skipNodeQueue: [],
        chatId: 'debug-session-chat-id'
      })
    );
  });

  it('allows an explicit chatId to override the modal chatId', () => {
    const result = createWorkflowDebugData({
      params: {
        entryNodeId: 'entry-node',
        runtimeNodes,
        runtimeEdges: [],
        variables: {},
        chatId: 'explicit-chat-id'
      },
      defaultChatId: 'debug-session-chat-id'
    });

    expect(result.chatId).toBe('explicit-chat-id');
  });
});

describe('createNextWorkflowDebugData', () => {
  it('preserves chatId and usageId for the next node or interactive run', () => {
    const result = createNextWorkflowDebugData({
      debugData: {
        runtimeNodes,
        runtimeEdges: [],
        entryNodeIds: ['entry-node'],
        variables: {},
        chatId: 'debug-session-chat-id'
      },
      response: {
        memoryNodes: [{ nodeId: 'next-node', inputs: [] }] as any,
        memoryEdges: [],
        entryNodeIds: ['next-node'],
        skipNodeQueue: [],
        newVariables: { result: 'done' },
        usageId: 'usage-id'
      }
    });

    expect(result).toEqual(
      expect.objectContaining({
        entryNodeIds: ['next-node'],
        variables: { result: 'done' },
        chatId: 'debug-session-chat-id',
        usageId: 'usage-id'
      })
    );
  });
});
