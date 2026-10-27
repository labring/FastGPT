import React, { act, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import ChatPanel from '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/ChatPanel';
import {
  WorkflowBuilderTrackingContext,
  WorkflowBuilderTrackingProvider
} from '@/components/core/chat/components/AIResponseBox/WorkflowBuilder/TrackingContext';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';

const mocks = vi.hoisted(() => ({
  box: vi.fn(),
  stream: vi.fn(),
  track: vi.fn(),
  register: vi.fn(),
  setData: vi.fn(),
  clear: vi.fn(),
  nodes: vi.fn(() => []),
  restart: vi.fn(),
  model: { modelId: 'model-1' }
}));
vi.mock('next/router', () => ({ useRouter: () => ({ query: {} }) }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children)
}));
vi.mock('@/components/core/chat/ChatContainer/ChatBox', () => ({
  default: (props: unknown) => {
    mocks.box(props);
    return null;
  }
}));
vi.mock('@/web/core/chat/context/chatItemContext', () => ({
  ChatItemContext: {},
  default: ({ children }: React.PropsWithChildren) => children
}));
vi.mock('@/web/core/chat/context/chatRecordContext', () => ({
  ChatRecordContext: {},
  default: ({ children }: React.PropsWithChildren) => children
}));
vi.mock('use-context-selector', () => ({
  createContext: React.createContext,
  useContextSelector: (_context: unknown, select: (value: unknown) => unknown) =>
    select({
      setChatBoxData: mocks.setData,
      chatBoxData: {},
      ChatBoxRef: null,
      chatRecords: [],
      isChatRecordsLoaded: true,
      clearChatRecords: mocks.clear,
      getNodes: mocks.nodes,
      edges: []
    })
}));
vi.mock('@/pageComponents/chat/ChatWindow/ChatAIModelSelector', () => ({ default: () => null }));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: (select: (state: unknown) => unknown) =>
    select({ userInfo: { team: { tmbId: 'member-1' } } })
}));
vi.mock('@/web/core/chat/context/useChatStore', () => ({
  useChatStore: (select: (state: unknown) => unknown) =>
    select({
      sourceChatIdMap: new Proxy({}, { get: () => 'chat-1' }),
      ensureSourceChatId: mocks.restart,
      setSourceChatId: mocks.restart
    })
}));
vi.mock('@/web/core/ai/model/useModelDefault', () => ({
  useModelDefault: () => ({ model: mocks.model })
}));
vi.mock('@/web/core/ai/model/useModelDetail', () => ({
  useModelDetail: () => ({ model: mocks.model })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({ useRequest: () => ({}) }));
vi.mock('@/web/common/middle/tracks/utils', () => ({
  webPushTrack: { workflowBuilder: mocks.track }
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/adapters/document', () => ({
  appDetailToWorkflowDocumentApp: () => ({}),
  reactFlowStateToWorkflowDocument: () => ({})
}));
vi.mock('@fastgpt/workflow-core/domain/checksum', () => ({
  getWorkflowChecksum: async () => 'checksum'
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/api', () => ({
  streamWorkflowBuilderChat: mocks.stream,
  clearWorkflowBuilderChatHistory: vi.fn()
}));

describe('Workflow Builder chat tracking boundary', () => {
  let dom: JSDOM;
  let root: ReturnType<typeof createRoot>;
  let showPreview: (id: string) => void;
  const Consumer = () => {
    showPreview = useContext(WorkflowBuilderTrackingContext)!.showPreview;
    return null;
  };
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.stream.mockResolvedValue({ responseText: 'answer' });
    dom = new JSDOM('<div id="root"></div>', { url: 'https://example.com' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('dispatchEvent', dom.window.dispatchEvent.bind(dom.window));
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    root = createRoot(document.getElementById('root')!);
    await act(async () =>
      root.render(
        React.createElement(
          WorkflowBuilderTrackingProvider,
          { appId: 'app-1' },
          React.createElement(Consumer),
          React.createElement(ChatPanel, {
            appId: 'app-1',
            appDetail: { name: 'App', chatConfig: {} } as never,
            workflowBuilderVersionActions: {
              isApplying: false,
              applyVersion: vi.fn(),
              notifyVersionExpired: vi.fn()
            },
            onChatIdChange: vi.fn(),
            onActivityChange: vi.fn(),
            focusRequestId: 0
          })
        )
      )
    );
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });
  const start = async (extra: Partial<StartChatFnProps> = {}) => {
    const onStart = mocks.box.mock.lastCall![0].onStartChat as (
      props: StartChatFnProps
    ) => Promise<unknown>;
    await act(async () => {
      await onStart({
        messages: [{ role: 'user', content: 'request' }],
        controller: new AbortController(),
        variables: {},
        generatingMessage: vi.fn(),
        ...extra
      });
    });
  };

  it('counts ordinary messages while excluding retries, automatic requests and clarification replies', async () => {
    await start();
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
      appId: 'app-1',
      action: 'message_submit'
    });
    await start({ submissionSource: 'retry' });
    await start({ submissionSource: 'auto' });
    await start({ interactive: { type: 'agentAsk' } as never });
    await start({ interactive: { type: 'workflowBuilderPreview' } as never });
    expect(mocks.track).toHaveBeenCalledOnce();
    expect(mocks.stream.mock.lastCall![0].data).not.toHaveProperty('submissionSource');
  });

  it('registers fresh preview eligibility before rendering its normal-stream event', async () => {
    await start();
    mocks.track.mockClear();
    const { onMessage } = mocks.stream.mock.lastCall![0];
    showPreview('preview-1');
    expect(mocks.track).not.toHaveBeenCalled();
    onMessage({
      event: 'interactive',
      interactive: { type: 'workflowBuilderPreview', previewId: 'preview-1', params: {} }
    });
    showPreview('preview-1');
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
      appId: 'app-1',
      action: 'preview_shown'
    });
  });
});
