import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useContextSelector } from 'use-context-selector';
import ChatRecordContextProvider, {
  ChatRecordContext
} from '@/web/core/chat/context/chatRecordContext';
import { WorkflowRuntimeContext } from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';
import { useChatRecordActions } from '@/components/core/chat/ChatContainer/ChatBox/hooks/useChatRecordActions';
import type { ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import {
  ChatRoleEnum,
  ChatSourceTypeEnum,
  ChatStatusEnum
} from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({ get: vi.fn(), delete: vi.fn(), send: vi.fn(), toast: vi.fn() }));
vi.mock('@/web/core/chat/record/api', () => ({
  getChatRecords: mocks.get,
  delChatRecordById: mocks.delete
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

const params = { sourceType: ChatSourceTypeEnum.app, appId: 'app', chatId: 'chat' } as const;
const human = (id: string): ChatSiteItemType => ({
  id,
  dataId: id,
  obj: ChatRoleEnum.Human,
  status: ChatStatusEnum.finish,
  value: [{ text: { content: id } }]
});
const ai = (id: string): ChatSiteItemType => ({
  id,
  dataId: id,
  obj: ChatRoleEnum.AI,
  status: ChatStatusEnum.finish,
  value: [{ text: { content: id } }]
});
const page = (list: ChatSiteItemType[], hasMorePrev = false, hasMoreNext = false) => ({
  list,
  total: list.length,
  hasMorePrev,
  hasMoreNext
});

describe('chat record truncation with real pagination and record actions', () => {
  let root: Root;
  let dom: JSDOM;
  let records: React.ComponentProps<typeof ChatRecordContext.Provider>['value'];
  let actions: ReturnType<typeof useChatRecordActions>;

  const Harness = () => {
    records = useContextSelector(ChatRecordContext, (value) => value);
    actions = useChatRecordActions({ sendPrompt: mocks.send });
    return null;
  };
  const render = async () => {
    const runtime = {
      sourceTarget: { sourceType: params.sourceType, sourceId: params.appId },
      sourceKey: 'app:app',
      chatId: params.chatId,
      fileUploadMode: 'runtime',
      fileUploading: false,
      setFileUploadingCount: () => {}
    } satisfies React.ComponentProps<typeof WorkflowRuntimeContext.Provider>['value'];
    /* eslint-disable react/no-children-prop -- Context Provider 的 children 为必填，需要显式传入以满足类型约束。 */
    await act(async () => {
      root.render(
        React.createElement(WorkflowRuntimeContext.Provider, {
          value: runtime,
          children: React.createElement(ChatRecordContextProvider, {
            params,
            children: React.createElement(Harness)
          })
        })
      );
    });
    /* eslint-enable react/no-children-prop */
  };

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>', { url: 'https://fastgpt.example' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    // 本文件不渲染滚动项，避免 scrollToItem 等待不存在的 DOM。
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1)
    );
    vi.clearAllMocks();
    mocks.delete.mockResolvedValue(undefined);
    root = createRoot(document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it.each(['retry', 'edit', 'agentAsk', 'workflowBuilderPreview'] as const)(
    'reuses the retained local history for %s without fetching records again',
    async (action) => {
      const previous = ai('previous-ai');
      const user = human('user');
      if (action === 'agentAsk') {
        previous.value = [
          {
            interactive: {
              type: 'agentAsk',
              entryNodeIds: [],
              memoryEdges: [],
              nodeOutputs: [],
              params: {
                toolCallId: 'ask',
                arguments: JSON.stringify({ questions: [{ question: 'Q?', options: [] }] })
              }
            }
          }
        ];
        user.value = [
          { select: { type: 'agentAsk', questions: [{ question: 'Q?', value: 'A' }] } }
        ];
      } else if (action === 'workflowBuilderPreview') {
        previous.value = [
          {
            interactive: {
              type: 'workflowBuilderPreview',
              entryNodeIds: [],
              memoryEdges: [],
              nodeOutputs: [],
              params: {
                toolCallId: 'preview',
                arguments: JSON.stringify({ title: 'Confirm?', mermaid: '', sections: [] })
              }
            }
          }
        ];
        user.value = [{ select: { type: 'workflowBuilderPreview', action: 'confirm' } }];
      }
      const prefix = [human('previous-user'), previous];
      mocks.get.mockResolvedValueOnce(page([...prefix, user, ai('answer')]));
      await render();

      await act(async () => {
        if (action === 'edit') await actions.editInput('user')?.({ text: 'Edited', files: [] });
        else await actions.retryInput('user')?.();
      });

      expect(mocks.delete).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ contentIds: ['user', 'answer'] })
      );
      expect(mocks.get).toHaveBeenCalledTimes(1);
      expect(records.chatRecords).toEqual(prefix);
      expect(mocks.send).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ history: prefix })
      );
      expect(mocks.send.mock.invocationCallOrder[0]).toBeGreaterThan(
        mocks.delete.mock.invocationCallOrder[0]
      );
    }
  );

  it('retries the first round locally even when no history remains', async () => {
    mocks.get.mockResolvedValueOnce(page([human('user'), ai('answer')]));
    await render();
    await act(async () => actions.retryInput('user')?.());
    expect(records.chatRecords).toEqual([]);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ history: [] }));
  });

  it.each([
    { hasMorePrev: true, hasMoreNext: false },
    { hasMorePrev: false, hasMoreNext: true }
  ])('refreshes an incomplete history window: %o', async ({ hasMorePrev, hasMoreNext }) => {
    const previous = ai('previous-ai');
    mocks.get.mockResolvedValueOnce(page([human('user'), ai('answer')], hasMorePrev, hasMoreNext));
    mocks.get.mockResolvedValueOnce(page([previous]));
    await render();
    await act(async () => actions.retryInput('user')?.());
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(mocks.get.mock.invocationCallOrder[1]).toBeGreaterThan(
      mocks.delete.mock.invocationCallOrder[0]
    );
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ history: [previous] }));
  });

  it('preserves the UI and does not resend when deletion fails', async () => {
    mocks.get.mockResolvedValueOnce(page([human('user'), ai('answer')]));
    await render();
    const original = records.chatRecords;
    mocks.delete.mockRejectedValueOnce(new Error('Delete failed'));
    await act(async () => actions.retryInput('user')?.());
    expect(records.chatRecords).toBe(original);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Delete failed' }));
  });
});
