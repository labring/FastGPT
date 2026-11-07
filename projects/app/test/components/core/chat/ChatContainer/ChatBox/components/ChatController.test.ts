/* eslint-disable react/no-children-prop -- use-context-selector 的 Provider 类型要求显式传入 children。 */
import React, { act, useState } from 'react';
import { JSDOM } from 'jsdom';
import { createRoot, type Root } from 'react-dom/client';
import {
  ChakraProvider,
  type BoxProps,
  type ButtonProps,
  type CheckboxProps
} from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useContextSelector } from 'use-context-selector';
import ChatController from '@/components/core/chat/ChatContainer/ChatBox/components/ChatController';
import ChatRecordsList from '@/components/core/chat/ChatContainer/ChatBox/components/ChatRecordsList';
import AIChatBubbleActions from '@/components/core/chat/ChatContainer/ChatBox/components/AIChatBubble/Actions';
import {
  ChatFeedbackContext,
  ChatFeedbackProvider,
  type ChatFeedbackContextValue
} from '@/components/core/chat/ChatContainer/context/chatFeedbackContext';
import { WorkflowRuntimeContextProvider } from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import RenderWorkflowBuilderVersion from '@/components/core/chat/components/AIResponseBox/WorkflowBuilder/RenderWorkflowBuilderVersion';
import { toChatAuthApiTarget } from '@/web/core/chat/utils';
import { FeedbackTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import {
  ChatRoleEnum,
  ChatSourceTypeEnum,
  ChatStatusEnum
} from '@fastgpt/global/core/chat/constants';
import type { ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@chakra-ui/react', async (importOriginal) => {
  const chakra = await importOriginal<typeof import('@chakra-ui/react')>();
  const { createElement, forwardRef } = await import('react');
  return {
    ...chakra,
    Box: forwardRef<HTMLDivElement, BoxProps>(({ children, id }, ref) =>
      createElement('div', { ref, id }, children)
    ),
    Checkbox: ({ children, onChange }: CheckboxProps) =>
      createElement(
        'label',
        null,
        createElement('input', { type: 'checkbox', onChange }),
        children
      ),
    Button: ({ children, isDisabled, isLoading, onClick, 'aria-pressed': pressed }: ButtonProps) =>
      React.createElement(
        'button',
        { disabled: isDisabled || isLoading, onClick, 'aria-pressed': pressed },
        children
      )
  };
});
vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: ({ name, onClick }: { name: string; onClick?: () => void }) =>
    React.createElement('span', { 'data-icon': name, onClick })
}));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
// 列表测试只验证反馈内容的开关，消息正文和气泡布局不参与这条路径。
vi.mock('@/components/core/chat/ChatContainer/ChatBox/components/ChatItem', () => ({
  default: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('section', null, children)
}));
// 撒花绘制与本次层级迁移无关，保留按钮状态及点击契约。
vi.mock('@/components/core/chat/ChatContainer/ChatBox/components/LikeFeedbackButton', () => ({
  default: ({
    onClick,
    isActive,
    isDisabled,
    effectTrigger,
    disableHoverTranslate = false
  }: {
    onClick?: () => void;
    isActive: boolean;
    isDisabled: boolean;
    effectTrigger?: number;
    disableHoverTranslate?: boolean;
  }) =>
    React.createElement('button', {
      'data-icon': 'core/chat/feedback/goodLight',
      'aria-pressed': isActive,
      disabled: isDisabled,
      'data-effect': effectTrigger,
      'data-disable-hover-translate': disableHoverTranslate,
      onClick
    })
}));

const { update, updateRead, closeCustom } = vi.hoisted(() => ({
  update: vi.fn(),
  updateRead: vi.fn(),
  closeCustom: vi.fn()
}));
vi.mock('@/web/core/chat/feedback/api', () => ({
  updateChatUserFeedback: update,
  updateFeedbackReadStatus: updateRead,
  closeCustomFeedback: closeCustom
}));

const message: ChatSiteItemType = {
  id: 'response-1',
  dataId: 'response-1',
  obj: ChatRoleEnum.AI,
  status: ChatStatusEnum.finish,
  value: [{ text: { content: '回答' } }]
};
const version = {
  versionNo: 1,
  name: '生成版本',
  filename: 'workflow.json',
  checksum: `sha256:${'0'.repeat(64)}`,
  generatedAt: '2026-10-29T10:00:00.000Z',
  expiresAt: '2099-10-30T10:00:00.000Z'
};

describe('ChatController feedback context', () => {
  let dom: JSDOM;
  let root: Root;
  let feedback: ChatFeedbackContextValue | undefined;
  const Consumer = () => {
    feedback = useContextSelector(ChatFeedbackContext, (value) => value);
    return null;
  };
  const Harness = ({
    fbTypes = [FeedbackTypeEnum.user, FeedbackTypeEnum.mark],
    sourceType = ChatSourceTypeEnum.app,
    active = true,
    showVersion = false,
    showRecords = false,
    showActions = false,
    initialMessage = message
  }: {
    fbTypes?: FeedbackTypeEnum[];
    sourceType?: ChatSourceTypeEnum;
    active?: boolean;
    showVersion?: boolean;
    showRecords?: boolean;
    showActions?: boolean;
    initialMessage?: ChatSiteItemType;
  }) => {
    const [records, setRecords] = useState<ChatSiteItemType[]>([initialMessage]);
    const recordContext = useContextSelector(ChatRecordContext, (value) => value);
    const content = React.createElement(ChatFeedbackProvider, {
      fbTypes,
      feedbackUserName: '测试用户',
      active,
      sourceKey: `${sourceType}:app-1`,
      chatId: 'chat-1',
      chatAuthTarget: toChatAuthApiTarget({ sourceTarget: { sourceType, sourceId: 'app-1' } }),
      setChatRecords: setRecords,
      children: React.createElement(
        React.Fragment,
        null,
        React.createElement(Consumer),
        showRecords
          ? React.createElement(ChatRecordsList, {
              records,
              expandedDeletedGroups: new Set<string>(),
              itemRefs: { current: new Map() },
              enableTTS: false,
              enableSandbox: false,
              statusBoxData: undefined,
              questionGuides: [],
              onToggleDeletedGroup: vi.fn(),
              onRetry: () => undefined,
              onEdit: () => undefined
            })
          : showActions
            ? React.createElement(AIChatBubbleActions, {
                historyItem: records[0],
                chatControllerProps: { chat: records[0], isLastChild: true },
                questionGuides: [],
                showWholeResponse: false,
                enableSandbox: false,
                onOpenWholeModal: vi.fn(),
                durationSeconds: 0
              })
            : React.createElement(ChatController, {
                chat: records[0],
                isLastChild: true,
                variant: 'footer',
                markQuestion: '上一问'
              }),
        showVersion &&
          React.createElement(RenderWorkflowBuilderVersion, {
            version,
            responseChatItemId: message.dataId
          })
      )
    });
    return React.createElement(ChakraProvider, {
      children: React.createElement(WorkflowRuntimeContextProvider, {
        sourceTarget: { sourceType, sourceId: 'app-1' },
        chatId: 'chat-1',
        fileUploadMode: 'runtime',
        children: React.createElement(ChatRecordContext.Provider, {
          value: { ...recordContext, chatRecords: records, setChatRecords: setRecords },
          children: content
        })
      })
    });
  };
  const render = async (props: React.ComponentProps<typeof Harness> = {}) => {
    await act(async () => root.render(React.createElement(Harness, props)));
  };
  const button = (icon: string) => document.querySelector<HTMLElement>(`[data-icon="${icon}"]`);

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
    vi.stubGlobal('React', React);
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
    vi.stubGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.resetAllMocks();
    update.mockResolvedValue(undefined);
    updateRead.mockResolvedValue(undefined);
    root = createRoot(document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('reads like, dislike and mark actions directly from the registered provider', async () => {
    await render();
    await act(async () => button('core/chat/feedback/goodLight')!.click());
    expect(update).toHaveBeenCalledWith({
      appId: 'app-1',
      chatId: 'chat-1',
      dataId: message.dataId,
      userGoodFeedback: 'yes',
      userBadFeedback: undefined
    });
    expect(button('core/chat/feedback/goodLight')!.getAttribute('aria-pressed')).toBe('true');
    expect(button('core/chat/feedback/goodLight')!.getAttribute('data-effect')).toBe('1');
    expect(
      button('core/chat/feedback/goodLight')!.getAttribute('data-disable-hover-translate')
    ).toBe('false');
    await act(async () => button('core/chat/feedback/badLight')!.click());
    expect(feedback?.feedbackId).toBe(message.dataId);
    await act(async () => button('core/app/markLight')!.click());
    expect(feedback?.adminMarkData).toEqual({ dataId: message.dataId, q: '上一问', a: '回答' });
  });

  it('controls footer feedback only through fbTypes, regardless of the source', async () => {
    await render({ fbTypes: [] });
    expect(button('core/chat/feedback/goodLight')).toBeNull();
    expect(button('core/chat/feedback/badLight')).toBeNull();
    await render({ sourceType: ChatSourceTypeEnum.workflowBuilder });
    expect(button('core/chat/feedback/goodLight')).not.toBeNull();
    expect(button('core/chat/feedback/badLight')).not.toBeNull();
    await render({ sourceType: ChatSourceTypeEnum.workflowBuilder, active: false });
    expect(button('core/chat/feedback/goodLight')).toBeNull();
    expect(button('core/chat/feedback/badLight')).toBeNull();
  });

  it('shows log feedback only when explicitly enabled and updates read status without a log chatType', async () => {
    const initialMessage: ChatSiteItemType = {
      ...message,
      obj: ChatRoleEnum.AI,
      value: [],
      userBadFeedback: '已有差评'
    };
    await render({ fbTypes: [], initialMessage });
    expect(button('core/chat/feedback/badLight')).toBeNull();

    await render({ fbTypes: [FeedbackTypeEnum.log], initialMessage });
    expect(button('core/chat/feedback/badLight')).not.toBeNull();
    const markRead = [...document.querySelectorAll('button')].find(
      (item) => item.textContent === 'chat:log.feedback.mark_as_read'
    );
    expect(markRead).toBeDefined();
    await act(async () => markRead!.click());
    expect(updateRead).toHaveBeenCalledWith({
      appId: 'app-1',
      chatId: 'chat-1',
      dataId: message.dataId,
      isRead: true
    });
    expect(document.body.textContent).toContain('chat:log.feedback.read');
    expect(update).not.toHaveBeenCalled();
  });

  it('independently enables mark and custom content instead of inferring visibility from stored fields', async () => {
    const initialMessage: ChatSiteItemType = {
      ...message,
      obj: ChatRoleEnum.AI,
      value: [],
      customFeedbacks: ['自定义内容'],
      adminFeedback: {
        datasetId: 'dataset-1',
        collectionId: 'collection-1',
        feedbackDataId: 'mark-1',
        q: '标注问题',
        a: '标注回答'
      }
    };
    const props = { initialMessage, showRecords: true };
    await render({ ...props, fbTypes: [] });
    expect(document.body.textContent).not.toContain('自定义内容');
    expect(document.body.textContent).not.toContain('标注问题');

    await render({ ...props, fbTypes: [FeedbackTypeEnum.mark, FeedbackTypeEnum.custom] });
    expect(document.body.textContent).toContain('自定义内容');
    expect(document.body.textContent).toContain('标注问题');
    await render({ ...props, fbTypes: [FeedbackTypeEnum.mark] });
    expect(document.body.textContent).not.toContain('自定义内容');
    expect(document.body.textContent).toContain('标注问题');
  });

  it('keeps Builder card feedback usable with a hidden footer and hides it in inactive spectator views', async () => {
    const props = {
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      fbTypes: [],
      showVersion: true
    };
    await render(props);
    expect(document.querySelectorAll('[data-icon="core/chat/feedback/goodLight"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-icon="core/chat/feedback/badLight"]')).toHaveLength(1);
    await act(async () => button('core/chat/feedback/goodLight')!.click());
    expect(update).toHaveBeenCalledWith({
      appId: 'app-1',
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      chatId: 'chat-1',
      dataId: message.dataId,
      userGoodFeedback: 'yes',
      userBadFeedback: undefined
    });
    expect(button('core/chat/feedback/goodLight')!.getAttribute('aria-pressed')).toBe('true');
    expect(button('core/chat/feedback/goodLight')!.getAttribute('data-effect')).toBe('1');
    expect(
      button('core/chat/feedback/goodLight')!.getAttribute('data-disable-hover-translate')
    ).toBe('false');
    await act(async () => button('core/chat/feedback/badLight')!.click());
    expect(feedback?.feedbackId).toBe(message.dataId);
    await act(async () => feedback?.onSubmitUserDislike('版本反馈'));
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ userBadFeedback: '版本反馈' })
    );

    await render({ ...props, active: false });
    expect(button('core/chat/feedback/goodLight')).toBeNull();
    expect(button('core/chat/feedback/badLight')).toBeNull();
    expect(button('copy')).not.toBeNull();
  });

  it('hides the log reason from user chat and toggles it with the saved read status in logs', async () => {
    const props = {
      showActions: true,
      initialMessage: { ...message, userBadFeedback: '日志差评原因' }
    };
    await render({ ...props, fbTypes: [FeedbackTypeEnum.user] });
    expect(document.body.textContent).not.toContain('日志差评原因');
    await render({ ...props, fbTypes: [FeedbackTypeEnum.log] });
    expect(document.body.textContent).toContain('日志差评原因');
    expect(document.body.textContent).toContain('测试用户');
    const readButton = () =>
      [...document.querySelectorAll('button')].find(
        (item) =>
          item.textContent === 'chat:log.feedback.mark_as_read' ||
          item.textContent === 'chat:log.feedback.read'
      )!;
    await act(async () => readButton().click());
    expect(document.body.textContent).not.toContain('日志差评原因');
    await act(async () => readButton().click());
    expect(document.body.textContent).toContain('日志差评原因');
    expect(updateRead).toHaveBeenLastCalledWith(expect.objectContaining({ isRead: false }));
    expect(update).not.toHaveBeenCalled();
  });

  it('closes custom feedback through the checkbox in the rendered log record', async () => {
    await render({
      showRecords: true,
      fbTypes: [FeedbackTypeEnum.custom],
      initialMessage: { ...message, customFeedbacks: ['待处理反馈'] }
    });
    expect(document.body.textContent).toContain('待处理反馈');
    await act(async () =>
      document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
    );
    expect(closeCustom).toHaveBeenCalledExactlyOnceWith({
      appId: 'app-1',
      chatId: 'chat-1',
      dataId: message.dataId,
      index: 0
    });
    expect(document.body.textContent).not.toContain('待处理反馈');
  });
});
