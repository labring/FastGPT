import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClearRecentlyUsedApps from '@/pageComponents/chat/ClearRecentlyUsedApps';

const mocks = vi.hoisted(() => ({ clearRecentlyUsed: vi.fn(), hasApps: true }));

vi.mock('@/web/core/chat/context/chatPageContext', () => ({ ChatPageContext: {} }));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_context: unknown, selector: (value: unknown) => unknown) =>
    selector({ myApps: mocks.hasApps ? [{}] : [], clearRecentlyUsed: mocks.clearRecentlyUsed })
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useRequest', async () => {
  const { useRequest } = await import('ahooks');
  return {
    useRequest: (service: Parameters<typeof useRequest>[0]) => useRequest(service, { manual: true })
  };
});
vi.mock('@fastgpt/web/hooks/useMemoEnhance', async () => {
  const { useMemo } = await import('react');
  return { useMemoEnhance: useMemo };
});
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { role: 'dialog' }, children)
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/DeleteConfirmInput', () => ({ default: () => null }));

describe('clear recently used apps button', () => {
  let root: Root;
  let container: HTMLDivElement;

  const button = (label: string) =>
    Array.from(container.querySelectorAll('button')).find((node) => node.textContent === label)!;
  const click = (label: string) => act(async () => button(label).click());

  beforeEach(async () => {
    vi.resetAllMocks();
    mocks.hasApps = true;
    mocks.clearRecentlyUsed.mockResolvedValue(undefined);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () =>
      root.render(
        React.createElement(ChakraProvider, null, React.createElement(ClearRecentlyUsedApps))
      )
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('requires confirmation and supports cancelling', async () => {
    await click('common:Clear');
    expect(mocks.clearRecentlyUsed).not.toHaveBeenCalled();
    expect(container.querySelector('[role=dialog]')?.textContent).toContain(
      'chat:confirm_clear_recent_apps'
    );
    await click('common:Cancel');
    expect(container.querySelector('[role=dialog]')).toBeNull();
    expect(mocks.clearRecentlyUsed).not.toHaveBeenCalled();
    await click('common:Clear');
    await click('common:Confirm');
    expect(mocks.clearRecentlyUsed).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role=dialog]')).toBeNull();
  });

  it('keeps confirmation open on failure and allows retry', async () => {
    mocks.clearRecentlyUsed.mockRejectedValueOnce(new Error('offline'));
    await click('common:Clear');
    await click('common:Confirm');
    expect(container.querySelector('[role=dialog]')).not.toBeNull();
    expect(button('common:Confirm').disabled).toBe(false);
    await click('common:Confirm');
    expect(mocks.clearRecentlyUsed).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role=dialog]')).toBeNull();
  });

  it('disables clearing an empty list', async () => {
    mocks.hasApps = false;
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(ClearRecentlyUsedApps, { key: 'empty' })
        )
      )
    );
    expect(button('common:Clear').disabled).toBe(true);
    expect(button('common:Clear').getAttribute('aria-label')).toBe('chat:clear_recent_apps');
  });
});
