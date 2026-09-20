import { describe, expect, it, vi } from 'vitest';

vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext', async () => {
  const { createContext } = await import('use-context-selector');
  return { WorkflowBufferDataContext: createContext({}) };
});

vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext',
  async () => {
    const { createContext } = await import('use-context-selector');
    return { WorkflowActionsContext: createContext({}) };
  }
);

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
  getWorkflowDebugRuntimeContext
} from '@/pageComponents/app/detail/WorkflowComponents/context/workflowDebugContext';

const runtimeNodes = [
  { nodeId: 'entry-node', inputs: [] },
  { nodeId: 'next-node', inputs: [] }
] as any;

describe('getWorkflowDebugRuntimeContext', () => {
  it('uses draft upload mode and exposes the generated debug chatId', () => {
    expect(
      getWorkflowDebugRuntimeContext({ appId: 'app-id', chatId: 'debug-session-chat-id' })
    ).toEqual({
      sourceTarget: { sourceType: 'app', sourceId: 'app-id' },
      chatId: 'debug-session-chat-id',
      outLinkAuthData: {},
      fileUploadMode: 'draft'
    });
  });

  it('uses an empty chatId before the debug modal creates a session', () => {
    expect(getWorkflowDebugRuntimeContext({ appId: 'app-id' }).chatId).toBe('');
  });
});

describe('createWorkflowDebugData', () => {
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
