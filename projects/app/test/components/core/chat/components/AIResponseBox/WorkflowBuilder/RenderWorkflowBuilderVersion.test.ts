import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RenderWorkflowBuilderVersion from '@/components/core/chat/components/AIResponseBox/WorkflowBuilder/RenderWorkflowBuilderVersion';
import type { WorkflowBuilderVersion } from '@fastgpt/global/core/workflow/builder/type';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';

const mocks = vi.hoisted(() => ({
  isApplying: false,
  applyVersion: vi.fn(),
  notifyVersionExpired: vi.fn()
}));

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@/web/core/chat/context/chatItemContext', () => ({ ChatItemContext: {} }));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_context: unknown, select: (value: unknown) => unknown) =>
    select({ workflowBuilderVersionActions: mocks })
}));
vi.mock('@chakra-ui/react', async () => {
  const { createElement } = await import('react');
  const Text = ({ as = 'span', children }: any) => createElement(as, null, children);
  return {
    Flex: ({ children }: any) => createElement('div', null, children),
    Text,
    Spinner: () => null,
    Button: ({ children, onClick, isDisabled, isLoading }: any) =>
      createElement('button', { onClick, disabled: isDisabled || isLoading }, children)
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
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    vi.unstubAllGlobals();
  });

  const renderAndApply = async (currentVersion = version) => {
    await act(async () =>
      root.render(
        React.createElement(RenderWorkflowBuilderVersion, {
          version: currentVersion,
          responseChatItemId: 'response-1'
        })
      )
    );
    await act(async () => container.querySelector('button')!.click());
  };

  it('marks an API expiration response as expired without repeating the parent toast', async () => {
    mocks.applyVersion.mockRejectedValue({
      code: ERROR_RESPONSE[AppErrEnum.workflowBuilderVersionExpired].code,
      message: '该工作流已过期，无法应用，请重新生成'
    });
    await renderAndApply();

    expect(mocks.applyVersion).toHaveBeenCalledWith(version, 'response-1');
    expect(container.querySelector('button')!.textContent).toBe('workflow_builder_version_expired');
    expect(container.querySelector('button')!.disabled).toBe(true);
    expect(mocks.notifyVersionExpired).not.toHaveBeenCalled();
  });

  it('keeps ordinary failures retryable even when their message contains expired', async () => {
    mocks.applyVersion.mockRejectedValue({ code: 500, message: 'Upstream token expired' });
    await renderAndApply();

    expect(container.querySelector('button')!.textContent).toBe('workflow_builder_version_apply');
    expect(container.querySelector('button')!.disabled).toBe(false);
    expect(mocks.notifyVersionExpired).not.toHaveBeenCalled();
  });

  it('preserves the applied feedback after a successful request', async () => {
    mocks.applyVersion.mockResolvedValue({ ...version, appliedAt: new Date().toISOString() });
    await renderAndApply();

    expect(container.querySelector('button')!.textContent).toBe('workflow_builder_version_applied');
    expect(container.querySelector('button')!.disabled).toBe(true);
  });

  it('disables other version cards until the shared application finishes', async () => {
    mocks.isApplying = true;
    await renderAndApply();

    expect(container.querySelector('button')!.disabled).toBe(true);
    expect(mocks.applyVersion).not.toHaveBeenCalled();

    mocks.isApplying = false;
    mocks.applyVersion.mockResolvedValue({ ...version, appliedAt: new Date().toISOString() });
    await renderAndApply({ ...version });

    expect(mocks.applyVersion).toHaveBeenCalledOnce();
    expect(container.querySelector('button')!.textContent).toBe('workflow_builder_version_applied');
  });
});
