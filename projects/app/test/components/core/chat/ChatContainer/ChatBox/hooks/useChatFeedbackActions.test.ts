/* eslint-disable react/no-children-prop -- use-context-selector 的 Provider 类型要求显式传入 children。 */
import { JSDOM } from 'jsdom';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatFeedbackActions } from '@/components/core/chat/ChatContainer/ChatBox/hooks/useChatFeedbackActions';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { WorkflowRuntimeContext } from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';
import {
  ChatTypeEnum,
  FeedbackTypeEnum
} from '@/components/core/chat/ChatContainer/ChatBox/constants';
import {
  ChatRoleEnum,
  ChatSourceTypeEnum,
  ChatStatusEnum
} from '@fastgpt/global/core/chat/constants';
import type { ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import type { ChatSourceTarget } from '@/web/core/chat/utils';

const mocks = vi.hoisted(() => ({ update: vi.fn(), toast: vi.fn() }));
vi.mock('@/web/core/chat/feedback/api', () => ({ updateChatUserFeedback: mocks.update }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const sourceTarget: ChatSourceTarget = {
  sourceType: ChatSourceTypeEnum.workflowBuilder,
  sourceId: 'app-1'
};
const message: Extract<ChatSiteItemType, { obj: ChatRoleEnum.AI }> = {
  id: 'response-1',
  dataId: 'response-1',
  obj: ChatRoleEnum.AI,
  status: ChatStatusEnum.finish,
  value: []
};
const human: ChatSiteItemType = {
  id: message.id,
  dataId: message.dataId,
  obj: ChatRoleEnum.Human,
  status: ChatStatusEnum.finish,
  value: []
};

describe('useChatFeedbackActions user feedback', () => {
  let dom: JSDOM;
  let root: Root;
  let result: ReturnType<typeof useChatFeedbackActions>;
  let records: ChatSiteItemType[];
  let setRecords: React.Dispatch<React.SetStateAction<ChatSiteItemType[]>>;
  type Props = {
    target?: ChatSourceTarget;
    chatId?: string;
    feedbackType?: FeedbackTypeEnum;
  };
  const Consumer = ({ feedbackType = FeedbackTypeEnum.user }: Props) => {
    result = useChatFeedbackActions({
      feedbackType,
      enableMark: false,
      chatType: ChatTypeEnum.test
    });
    return null;
  };
  const Harness = ({ target = sourceTarget, chatId = 'chat-1', ...props }: Props) => {
    const [chatRecords, setChatRecords] = useState<ChatSiteItemType[]>([message]);
    records = chatRecords;
    setRecords = setChatRecords;
    return React.createElement(WorkflowRuntimeContext.Provider, {
      value: {
        sourceTarget: target,
        sourceKey: `${target.sourceType}:${target.sourceId}`,
        chatId,
        fileUploadMode: 'runtime',
        fileUploading: false,
        setFileUploadingCount: () => {}
      },
      children: React.createElement(ChatRecordContext.Provider, {
        value: {
          chatRecords,
          setChatRecords,
          isLoadingRecords: false,
          refreshChatRecords: async () => chatRecords,
          isChatRecordsLoaded: true,
          totalRecordsCount: chatRecords.length,
          ScrollData: ({ children }) => React.createElement(React.Fragment, null, children),
          itemRefs: { current: new Map() }
        },
        children: React.createElement(Consumer, props)
      })
    });
  };
  const render = async (props: Props = {}) => {
    await act(async () => root.render(React.createElement(Harness, props)));
  };
  const like = () => result.onAddUserLike(records[0])!();
  const dislike = () => result.onAddUserDislike(records[0])!();
  const ai = () => {
    const record = records[0];
    if (record.obj !== ChatRoleEnum.AI) throw new Error('Expected an AI record');
    return record;
  };

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.resetAllMocks();
    mocks.update.mockResolvedValue(undefined);
    root = createRoot(document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('persists through the existing Builder feedback endpoint before selecting and animating the like', async () => {
    vi.useFakeTimers();
    await render();
    let resolve!: () => void;
    mocks.update.mockReturnValue(
      new Promise<void>((done) => {
        resolve = done;
      })
    );
    let request: ReturnType<typeof like>;
    await act(async () => {
      request = like();
    });
    expect(mocks.update).toHaveBeenCalledWith({
      appId: 'app-1',
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      chatId: 'chat-1',
      dataId: 'response-1',
      userGoodFeedback: 'yes'
    });
    expect(ai().userGoodFeedback).toBeUndefined();
    expect(result.pendingFeedbackIds).toEqual(['response-1']);
    await act(async () => {
      resolve();
      await request;
    });
    expect(ai().userGoodFeedback).toBe('yes');
    expect(result.pendingFeedbackIds).toEqual([]);
    expect(result.likeFeedbackEffect).toMatchObject({ dataId: 'response-1' });
    await act(async () => vi.advanceTimersByTime(800));
    expect(result.likeFeedbackEffect).toBeUndefined();
    await act(async () => like());
    expect(ai().userGoodFeedback).toBeUndefined();
    expect(mocks.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ userGoodFeedback: undefined })
    );
  });

  it('preserves both the saved feedback and animation state when the request fails, then permits retry', async () => {
    await render();
    await act(async () => setRecords([{ ...message, userBadFeedback: '缺少节点' }]));
    mocks.update.mockRejectedValueOnce(new Error('network failed'));
    await act(async () => like());
    expect(ai().userBadFeedback).toBe('缺少节点');
    expect(ai().userGoodFeedback).toBeUndefined();
    expect(result.likeFeedbackEffect).toBeUndefined();
    expect(result.pendingFeedbackIds).toEqual([]);
    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'error',
      title: 'common:core.chat.Feedback Failed'
    });
    await act(async () => like());
    expect(ai().userBadFeedback).toBeUndefined();
    expect(ai().userGoodFeedback).toBe('yes');
  });

  it('deduplicates repeated feedback while a request is running', async () => {
    await render();
    let resolve!: () => void;
    mocks.update.mockReturnValue(
      new Promise<void>((done) => {
        resolve = done;
      })
    );
    let request: ReturnType<typeof like>;
    await act(async () => {
      request = like();
      void like();
      void dislike();
    });
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(result.feedbackId).toBeUndefined();
    await act(async () => {
      resolve();
      await request;
    });
    expect(result.pendingFeedbackIds).toEqual([]);
  });

  it('opens and cancels the existing dislike dialog without changing feedback, then applies its successful result', async () => {
    await render();
    await act(async () => like());
    await act(async () => dislike());
    expect(result.feedbackId).toBe(message.dataId);
    expect(result.likeFeedbackEffect).toBeUndefined();
    expect(ai().userGoodFeedback).toBe('yes');
    expect(mocks.update).toHaveBeenCalledTimes(1);
    await act(async () => result.setFeedbackId(undefined));
    expect(ai().userGoodFeedback).toBe('yes');
    await act(async () => dislike());
    await act(async () => result.onFeedbackSuccess('生成结果不符合要求'));
    expect(ai().userGoodFeedback).toBeUndefined();
    expect(ai().userBadFeedback).toBe('生成结果不符合要求');
    expect(result.feedbackId).toBeUndefined();
    await act(async () => dislike());
    expect(ai().userBadFeedback).toBeUndefined();
    expect(mocks.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ userGoodFeedback: undefined })
    );
  });

  it('never writes feedback onto a human message sharing the same dataId', async () => {
    await render();
    await act(async () => setRecords([message, human]));
    await act(async () => like());
    expect(records[1]).not.toHaveProperty('userGoodFeedback');
    await act(async () => dislike());
    await act(async () => result.onFeedbackSuccess('原因'));
    expect(records[1]).not.toHaveProperty('userBadFeedback');
  });

  it.each(['success', 'failure'] as const)(
    'ignores an old request %s after switching conversations and sources',
    async (outcome) => {
      await render();
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      mocks.update.mockReturnValue(
        new Promise<void>((done, fail) => {
          resolve = done;
          reject = fail;
        })
      );
      let request: ReturnType<typeof like>;
      await act(async () => {
        request = like();
      });
      await render({
        target: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' },
        chatId: 'chat-2'
      });
      await act(async () => setRecords([{ ...message }]));
      await act(async () => {
        if (outcome === 'success') resolve();
        else reject(new Error('old failure'));
        await request;
      });
      expect(ai().userGoodFeedback).toBeUndefined();
      expect(result.likeFeedbackEffect).toBeUndefined();
      expect(mocks.toast).not.toHaveBeenCalled();
    }
  );

  it('preserves the ordinary app request format', async () => {
    await render({ target: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' } });
    await act(async () => like());
    expect(mocks.update).toHaveBeenCalledWith({
      appId: 'app-1',
      chatId: 'chat-1',
      dataId: 'response-1',
      userGoodFeedback: 'yes'
    });
  });

  it('does not provide user actions in hidden mode or for human messages', async () => {
    await render({ feedbackType: FeedbackTypeEnum.hidden });
    expect(result.onAddUserLike(message)).toBeUndefined();
    expect(result.onAddUserDislike(message)).toBeUndefined();
    await render();
    expect(result.onAddUserLike(human)).toBeUndefined();
    expect(result.onAddUserDislike(human)).toBeUndefined();
  });
});
