import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RenderWorkflowBuilderVersion from '@/components/core/chat/components/AIResponseBox/WorkflowBuilder/RenderWorkflowBuilderVersion';
import type { WorkflowBuilderVersion } from '@fastgpt/global/core/workflow/builder/type';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';

const mocks = vi.hoisted(() => ({
  isApplying: false,
  applyVersion: vi.fn(),
  notifyVersionExpired: vi.fn(),
  feedbackEnabled: false,
  records: [] as ChatSiteItemType[],
  pendingFeedbackIds: [] as string[],
  likeFeedbackEffect: undefined as { dataId: string; trigger: number } | undefined,
  onAddUserLike: vi.fn(),
  onAddUserDislike: vi.fn(),
  onLike: vi.fn(),
  onDislike: vi.fn()
}));

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: ({ name, color }: any) =>
    React.createElement('svg', { 'data-icon': name, 'data-color': color })
}));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: any) => children
}));
vi.mock('@/components/core/chat/ChatContainer/ChatBox/components/LikeFeedbackButton', () => ({
  default: ({ onClick, isActive, isDisabled, ariaLabel, effectTrigger }: any) =>
    React.createElement('button', {
      onClick,
      disabled: isDisabled,
      'aria-label': ariaLabel,
      'aria-pressed': isActive,
      'data-effect': effectTrigger
    })
}));
vi.mock('@/web/core/chat/context/chatItemContext', () => ({ ChatItemContext: {} }));
vi.mock('@/web/core/chat/context/chatRecordContext', () => ({ ChatRecordContext: 'records' }));
vi.mock('@/components/core/chat/ChatContainer/context/chatFeedbackContext', () => ({
  ChatFeedbackContext: 'feedback'
}));
vi.mock('use-context-selector', () => ({
  useContextSelector: (context: unknown, select: (value: unknown) => unknown) => {
    if (context === 'records') return select({ chatRecords: mocks.records });
    if (context === 'feedback') return select(mocks.feedbackEnabled ? mocks : undefined);
    return select({ workflowBuilderVersionActions: mocks });
  }
}));
vi.mock('@chakra-ui/react', async () => {
  const { createElement } = await import('react');
  const Text = ({ as = 'span', children, color }: any) =>
    createElement(as, { 'data-color': color }, children);
  return {
    Flex: ({ children }: any) => createElement('div', null, children),
    Text,
    Spinner: () => null,
    Button: ({ children, onClick, isDisabled, isLoading, ...props }: any) =>
      createElement(
        'button',
        {
          onClick,
          disabled: isDisabled || isLoading,
          'aria-label': props['aria-label'],
          'aria-pressed': props['aria-pressed']
        },
        children
      )
  };
});

const version: WorkflowBuilderVersion = {
  versionNo: 1,
  name: 'AI 生成版本 1',
  filename: 'AI 生成版本 1.json',
  checksum: `sha256:${'0'.repeat(64)}`,
  generatedAt: '2026-08-12T10:00:00.000Z',
  expiresAt: '2099-08-13T10:00:00.000Z'
};

describe('RenderWorkflowBuilderVersion', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.resetAllMocks();
    mocks.isApplying = false;
    mocks.feedbackEnabled = false;
    mocks.pendingFeedbackIds = [];
    mocks.likeFeedbackEffect = undefined;
    mocks.records = [
      {
        id: 'response-1',
        dataId: 'response-1',
        obj: ChatRoleEnum.AI,
        status: ChatStatusEnum.finish,
        value: []
      }
    ];
    mocks.onAddUserLike.mockReturnValue(mocks.onLike);
    mocks.onAddUserDislike.mockReturnValue(mocks.onDislike);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const render = async (currentVersion = version) => {
    await act(async () =>
      root.render(
        React.createElement(RenderWorkflowBuilderVersion, {
          version: currentVersion,
          responseChatItemId: 'response-1'
        })
      )
    );
  };
  const applyButton = () => [...container.querySelectorAll('button')].at(-1)!;
  const renderAndApply = async (currentVersion = version) => {
    await render(currentVersion);
    await act(async () => applyButton().click());
  };

  it('marks an API expiration response as expired without repeating the parent toast', async () => {
    mocks.applyVersion.mockRejectedValue({
      code: ERROR_RESPONSE[AppErrEnum.workflowBuilderVersionExpired].code,
      message: '该工作流已过期，无法应用，请重新生成'
    });
    await renderAndApply();

    expect(mocks.applyVersion).toHaveBeenCalledWith(version, 'response-1');
    expect(applyButton().textContent).toBe('workflow_builder_version_expired');
    expect(applyButton().disabled).toBe(true);
    expect(mocks.notifyVersionExpired).not.toHaveBeenCalled();
  });

  it('keeps ordinary failures retryable even when their message contains expired', async () => {
    mocks.applyVersion.mockRejectedValue({ code: 500, message: 'Upstream token expired' });
    await renderAndApply();

    expect(applyButton().textContent).toBe('workflow_builder_version_apply');
    expect(applyButton().disabled).toBe(false);
    expect(mocks.notifyVersionExpired).not.toHaveBeenCalled();
  });

  it('keeps the apply button unchanged while updating the applied title and allowing reapplication', async () => {
    mocks.applyVersion.mockResolvedValue({ ...version, appliedAt: new Date().toISOString() });
    await renderAndApply();

    expect(applyButton().textContent).toBe('workflow_builder_version_apply');
    expect(applyButton().disabled).toBe(false);
    await act(async () => applyButton().click());
    expect(mocks.applyVersion).toHaveBeenCalledTimes(2);
    expect(applyButton().querySelector('[data-icon="check"]')).toBeNull();
    expect(applyButton().textContent).toBe('workflow_builder_version_apply');
    expect(applyButton().disabled).toBe(false);
    expect(container.textContent).toContain(`${version.name} workflow_builder_version_applied`);
    expect(
      container.querySelector('[data-icon="core/app/workflowVersion"]')?.getAttribute('data-color')
    ).toBe('myGray.600');
  });

  it('locks a repeat application while pending and allows retry after failure', async () => {
    mocks.applyVersion.mockResolvedValueOnce({ ...version, appliedAt: new Date().toISOString() });
    await renderAndApply();
    let reject!: (reason: Error) => void;
    mocks.applyVersion.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      })
    );
    await act(async () => applyButton().click());
    expect(applyButton().disabled).toBe(true);
    await act(async () => applyButton().click());
    expect(mocks.applyVersion).toHaveBeenCalledTimes(2);
    await act(async () => reject(new Error('apply failed')));
    expect(applyButton().disabled).toBe(false);
    expect(applyButton().textContent).toBe('workflow_builder_version_apply');
  });

  it('disables other version cards until the shared application finishes', async () => {
    mocks.isApplying = true;
    await renderAndApply();

    expect(applyButton().disabled).toBe(true);
    expect(mocks.applyVersion).not.toHaveBeenCalled();

    mocks.isApplying = false;
    mocks.applyVersion.mockResolvedValue({ ...version, appliedAt: new Date().toISOString() });
    await renderAndApply({ ...version });

    expect(mocks.applyVersion).toHaveBeenCalledOnce();
    expect(applyButton().textContent).toBe('workflow_builder_version_apply');
  });

  it('restores applied state and feedback from history while allowing feedback before and after applying', async () => {
    mocks.feedbackEnabled = true;
    mocks.records[0] = {
      ...mocks.records[0],
      obj: ChatRoleEnum.AI,
      value: [],
      userGoodFeedback: 'yes'
    };
    mocks.likeFeedbackEffect = { dataId: 'response-1', trigger: 1 };
    await render();
    expect(container.textContent).toContain('workflow_builder_version_ready_suffix');
    expect(
      container.querySelector('[data-icon="core/app/workflowVersion"]')?.getAttribute('data-color')
    ).toBe('primary.600');
    const like = () =>
      container.querySelector<HTMLButtonElement>('[aria-label="chat:feedback_helpful"]')!;
    const dislike = () =>
      container.querySelector<HTMLButtonElement>('[aria-label="chat:feedback_unhelpful"]')!;
    expect(like().getAttribute('aria-pressed')).toBe('true');
    expect(like().getAttribute('data-effect')).toBe('1');
    await act(async () => like().click());
    expect(mocks.onLike).toHaveBeenCalledOnce();
    expect(mocks.onAddUserLike).toHaveBeenLastCalledWith(mocks.records[0]);

    mocks.records[0] = {
      ...mocks.records[0],
      obj: ChatRoleEnum.AI,
      value: [],
      userGoodFeedback: undefined,
      userBadFeedback: '缺少节点'
    };
    await render({ ...version, appliedAt: '2026-10-29T01:00:00.000Z' });
    expect(like().getAttribute('aria-pressed')).toBe('false');
    expect(dislike().getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain(`${version.name} workflow_builder_version_applied`);
    expect(applyButton().disabled).toBe(false);
    await act(async () => dislike().click());
    expect(mocks.onDislike).toHaveBeenCalledOnce();
  });

  it('disables feedback during submission and hides it without an enabled feedback context', async () => {
    mocks.feedbackEnabled = true;
    mocks.pendingFeedbackIds = ['response-1'];
    await render();
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(3);
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(true);
    expect(applyButton().disabled).toBe(false);

    mocks.feedbackEnabled = false;
    await render({ ...version });
    expect(container.querySelectorAll('button')).toHaveLength(1);
  });
});
