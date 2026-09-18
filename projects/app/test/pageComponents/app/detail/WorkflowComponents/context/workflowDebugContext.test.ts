import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useContextSelector } from 'use-context-selector';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext', async () => {
  const { createContext } = await import('use-context-selector');
  return { WorkflowBufferDataContext: createContext({ setNodes: vi.fn() }) };
});

vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext',
  async () => {
    const { createContext } = await import('use-context-selector');
    return { WorkflowActionsContext: createContext({ onChangeNode: vi.fn() }) };
  }
);

vi.mock('@/pageComponents/app/detail/context', async () => {
  const { createContext } = await import('use-context-selector');
  return {
    AppContext: createContext({ appDetail: { _id: 'app-id', chatConfig: {} } })
  };
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
  getWorkflowDebugRuntimeContext,
  WorkflowDebugContext,
  WorkflowDebugProvider
} from '@/pageComponents/app/detail/WorkflowComponents/context/workflowDebugContext';

const runtimeNodes = [
  { nodeId: 'entry-node', inputs: [] },
  { nodeId: 'next-node', inputs: [] }
] as any;

describe('WorkflowDebugProvider', () => {
  it('shares submission invalidation across different node debug owners', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    const controllers: any[] = [];
    const Consumer = ({ index }: { index: number }) => {
      controllers[index] = useContextSelector(
        WorkflowDebugContext,
        (value) => value.readFilesSubmissionController
      );
      return null;
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          React.createElement(
            WorkflowDebugProvider,
            null,
            React.createElement(Consumer, { index: 0 }),
            React.createElement(Consumer, { index: 1 })
          )
        );
      });

      expect(controllers[0]).toBe(controllers[1]);
      const oldSubmission = controllers[0].begin();
      controllers[1].invalidate();

      expect(controllers[0].isCurrent(oldSubmission)).toBe(false);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      dom.window.close();
      vi.unstubAllGlobals();
    }
  });
});

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
