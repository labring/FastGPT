/* eslint-disable react/no-children-prop -- use-context-selector 的 Provider 类型要求显式传入 children。 */
import { JSDOM } from 'jsdom';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatFeedbackContext,
  ChatFeedbackProvider,
  type ChatFeedbackContextValue
} from '@/components/core/chat/ChatContainer/context/chatFeedbackContext';
import { useContextSelector } from 'use-context-selector';
import { FeedbackTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import {
  ChatRoleEnum,
  ChatSourceTypeEnum,
  ChatStatusEnum
} from '@fastgpt/global/core/chat/constants';
import type { ResolvedChatAuthTargetInput } from '@/web/core/chat/type';
import type { ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  updateAdmin: vi.fn(),
  closeCustom: vi.fn(),
  updateRead: vi.fn(),
  toast: vi.fn(),
  refresh: vi.fn()
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/web/core/chat/feedback/api', () => ({
  updateChatUserFeedback: mocks.update,
  updateChatAdminFeedback: mocks.updateAdmin,
  closeCustomFeedback: mocks.closeCustom,
  updateFeedbackReadStatus: mocks.updateRead
}));

const chatAuthTarget: ResolvedChatAuthTargetInput = {
  appId: 'app-1',
  sourceType: ChatSourceTypeEnum.workflowBuilder
};
const requestTarget = { ...chatAuthTarget, chatId: 'chat-1' };

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

describe('ChatFeedbackProvider', () => {
  let dom: JSDOM;
  let root: Root;
  let result: ChatFeedbackContextValue;
  let records: ChatSiteItemType[];
  let setRecords: React.Dispatch<React.SetStateAction<ChatSiteItemType[]>>;
  type Props = {
    sourceKey?: string;
    chatId?: string;
    target?: ResolvedChatAuthTargetInput;
    fbTypes?: FeedbackTypeEnum[];
    active?: boolean;
  };
  const Consumer = () => {
    const feedback = useContextSelector(ChatFeedbackContext, (value) => value);
    if (!feedback) throw new Error('Missing feedback provider');
    result = feedback;
    return null;
  };
  const Harness = ({
    sourceKey = 'workflowBuilder:app-1',
    chatId = 'chat-1',
    target = chatAuthTarget,
    fbTypes = [FeedbackTypeEnum.user],
    active = true
  }: Props) => {
    const [chatRecords, setChatRecords] = useState<ChatSiteItemType[]>([message]);
    records = chatRecords;
    setRecords = setChatRecords;
    // 不注册其他业务 Context，只隔离反馈 API，验证会话和记录依赖来自 props。
    return React.createElement(ChatFeedbackProvider, {
      fbTypes,
      feedbackUserName: '访客',
      active,
      sourceKey,
      chatId,
      chatAuthTarget: target,
      setChatRecords,
      onTriggerRefresh: mocks.refresh,
      children: React.createElement(Consumer)
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

  it('waits for the feedback request before selecting and animating the like', async () => {
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
      ...requestTarget,
      dataId: 'response-1',
      userGoodFeedback: 'yes',
      userBadFeedback: undefined
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

  it.each<ResolvedChatAuthTargetInput>([
    { appId: 'app-1' },
    { skillId: 'skill-1' },
    { outLinkAuthData: { shareId: 'share-1', outLinkUid: 'visitor-1' } }
  ])('preserves the injected API authentication target %j', async (target) => {
    await render({ target });
    await act(async () => like());
    expect(mocks.update).toHaveBeenCalledWith({
      ...target,
      chatId: 'chat-1',
      dataId: message.dataId,
      userGoodFeedback: 'yes',
      userBadFeedback: undefined
    });
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
    await act(async () => result.onSubmitUserDislike('生成结果不符合要求'));
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
    await act(async () => result.onSubmitUserDislike('原因'));
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
        sourceKey: 'app:app-1',
        chatId: 'chat-2',
        target: { appId: 'app-1' }
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

  it('allows card feedback with a hidden footer and disables actions for inactive views or human messages', async () => {
    await render({ fbTypes: [] });
    await act(async () => like());
    expect(ai().userGoodFeedback).toBe('yes');
    await act(async () => dislike());
    await act(async () => result.onSubmitUserDislike('卡片反馈'));
    expect(ai().userBadFeedback).toBe('卡片反馈');
    expect(result.onAddUserLike(human)).toBeUndefined();
    expect(result.onAddUserDislike(human)).toBeUndefined();

    await act(async () => result.setFeedbackId(message.dataId));
    mocks.update.mockClear();
    await render({ active: false });
    expect(result.onAddUserLike(message)).toBeUndefined();
    expect(result.onAddUserDislike(message)).toBeUndefined();
    await act(async () => result.onSubmitUserDislike('旁观反馈'));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('exposes feedback configuration and keeps requests disabled without a persisted target', async () => {
    await render({ chatId: '' });
    expect(result.fbTypes).toEqual([FeedbackTypeEnum.user]);
    expect(result.feedbackUserName).toBe('访客');
    await act(async () => {
      await like();
      dislike();
      await result.onSubmitUserDislike('原因');
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(result.feedbackId).toBeUndefined();
  });

  it('keeps a failed dislike dialog open for retry and serializes submission with likes', async () => {
    await render();
    await act(async () => dislike());
    mocks.update.mockRejectedValueOnce(new Error('failed'));
    await act(async () => result.onSubmitUserDislike('原因'));
    expect(result.feedbackId).toBe(message.dataId);
    expect(ai().userBadFeedback).toBeUndefined();
    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'error',
      title: 'common:core.chat.Feedback Failed'
    });

    let resolve!: () => void;
    mocks.update.mockReturnValueOnce(new Promise<void>((done) => (resolve = done)));
    let request: Promise<void>;
    await act(async () => {
      request = result.onSubmitUserDislike('原因');
      await like();
      await result.onSubmitUserDislike('重复提交');
    });
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(result.pendingFeedbackIds).toEqual([message.dataId]);
    await act(async () => {
      resolve();
      await request;
    });
    expect(ai().userBadFeedback).toBe('原因');
    expect(result.feedbackId).toBeUndefined();
    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'success',
      title: 'common:core.chat.Feedback Success'
    });
    expect(mocks.toast).toHaveBeenCalledTimes(2);
  });

  it('keeps a different message dialog open when an earlier dislike submission finishes', async () => {
    await render();
    const nextMessage = { ...message, id: 'response-2', dataId: 'response-2' };
    await act(async () => setRecords([message, nextMessage]));
    await act(async () => dislike());

    let resolve!: () => void;
    mocks.update.mockReturnValueOnce(new Promise<void>((done) => (resolve = done)));
    let request: Promise<void>;
    await act(async () => {
      request = result.onSubmitUserDislike('第一条反馈');
    });
    await act(async () => result.setFeedbackId(undefined));
    await act(async () => result.onAddUserDislike(records[1])?.());
    expect(result.feedbackId).toBe(nextMessage.dataId);

    await act(async () => {
      resolve();
      await request;
    });
    expect(ai().userBadFeedback).toBe('第一条反馈');
    expect(records[1]).not.toHaveProperty('userBadFeedback');
    expect(result.feedbackId).toBe(nextMessage.dataId);
  });

  it('closes old dialogs and allows feedback on the same dataId in a different conversation', async () => {
    await render({ fbTypes: [FeedbackTypeEnum.mark] });
    await act(async () => {
      dislike();
      result.onMark(message, { q: '问题', a: '回答' })?.();
    });
    let resolve!: () => void;
    mocks.update.mockReturnValueOnce(new Promise<void>((done) => (resolve = done)));
    let oldRequest: Promise<void>;
    await act(async () => {
      oldRequest = result.onSubmitUserDislike('旧会话原因');
    });

    await render({ sourceKey: 'app:app-1', chatId: 'chat-2', target: { appId: 'app-1' } });
    expect(result.feedbackId).toBeUndefined();
    expect(result.adminMarkData).toBeUndefined();
    expect(result.pendingFeedbackIds).toEqual([]);
    await act(async () => like());
    await act(async () => {
      resolve();
      await oldRequest;
    });
    expect(ai().userGoodFeedback).toBe('yes');
    expect(ai().userBadFeedback).toBeUndefined();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('creates and edits admin marks through the feedback API', async () => {
    await render();
    expect(result.onMark(message, { q: '问题', a: '回答' })).toBeUndefined();
    await render({ fbTypes: [FeedbackTypeEnum.mark] });
    expect(result.onMark(human, { q: '问题', a: '回答' })).toBeUndefined();
    await act(async () => result.onMark(message, { q: '问题', a: '回答' })?.());
    expect(result.adminMarkData).toEqual({ dataId: message.dataId, q: '问题', a: '回答' });

    const adminFeedback = {
      datasetId: 'dataset-1',
      collectionId: 'collection-1',
      feedbackDataId: 'feedback-1',
      q: '修改的问题',
      a: '修改的回答'
    };
    await act(async () => {
      setRecords([message, human]);
      result.onAdminMarkSuccess(adminFeedback);
    });
    expect(mocks.updateAdmin).toHaveBeenCalledWith({
      ...requestTarget,
      dataId: message.dataId,
      ...adminFeedback
    });
    expect(ai().adminFeedback).toEqual(adminFeedback);
    expect(records[1]).not.toHaveProperty('adminFeedback');
    await act(async () => result.onMark(ai(), { q: '默认问题', a: '默认回答' })?.());
    expect(result.adminMarkData).toEqual({ dataId: message.dataId, ...adminFeedback });
  });

  it('closes custom feedback and updates log feedback read state without modifying human records', async () => {
    await render({ fbTypes: [FeedbackTypeEnum.log, FeedbackTypeEnum.custom] });
    await act(async () => setRecords([{ ...message, customFeedbacks: ['保留', '关闭'] }, human]));
    await act(async () => {
      result.onCloseCustomFeedback(
        ai(),
        1
      )({ target: { checked: false } } as React.ChangeEvent<HTMLInputElement>);
    });
    expect(mocks.closeCustom).not.toHaveBeenCalled();
    await act(async () => {
      result.onCloseCustomFeedback(
        ai(),
        1
      )({ target: { checked: true } } as React.ChangeEvent<HTMLInputElement>);
    });
    expect(mocks.closeCustom).toHaveBeenCalledWith({
      ...requestTarget,
      dataId: message.dataId,
      index: 1
    });
    expect(ai().customFeedbacks).toEqual(['保留']);
    expect(result.onToggleFeedbackReadStatus(human)).toBeUndefined();
    mocks.updateRead.mockRejectedValueOnce(new Error('failed'));
    await act(async () => result.onToggleFeedbackReadStatus(ai())?.());
    expect(ai().isFeedbackRead).toBeUndefined();
    expect(mocks.refresh).not.toHaveBeenCalled();
    await act(async () => result.onToggleFeedbackReadStatus(ai())?.());
    expect(mocks.updateRead).toHaveBeenLastCalledWith({
      ...requestTarget,
      dataId: message.dataId,
      isRead: true
    });
    expect(ai().isFeedbackRead).toBe(true);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(records[1]).not.toHaveProperty('isFeedbackRead');
  });

  it('disables mark, log and custom actions when their types are not enabled', async () => {
    await render({ fbTypes: [] });
    expect(result.onMark(message, { q: '问题', a: '回答' })).toBeUndefined();
    expect(result.onToggleFeedbackReadStatus(message)).toBeUndefined();
    await act(async () => {
      result.onCloseCustomFeedback(
        message,
        0
      )({ target: { checked: true } } as React.ChangeEvent<HTMLInputElement>);
    });
    expect(mocks.closeCustom).not.toHaveBeenCalled();
  });
});
