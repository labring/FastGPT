import { JSDOM } from 'jsdom';
import React, { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ toast: vi.fn(), getReferencedApps: vi.fn() }));

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@chakra-ui/react', () => {
  const Element = ({ children }: { children?: ReactNode }) =>
    React.createElement('div', {}, children);
  return { Box: Element, Flex: Element, HStack: Element };
});
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyBox', () => ({
  default: ({ children, isLoading }: { children?: ReactNode; isLoading: boolean }) =>
    React.createElement('div', { 'data-loading': String(isLoading) }, children)
}));
vi.mock('@fastgpt/web/components/common/MyPopover', () => ({
  default: ({ children }: { children: () => ReactNode }) => children()
}));
vi.mock('@/web/core/app/api/app', () => ({ getReferencedApps: mocks.getReferencedApps }));

import ReferencedAppsPopover from '@/pageComponents/dashboard/ReferencedAppsPopover';

describe('ReferencedAppsPopover', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    mocks.getReferencedApps.mockResolvedValue({ list: [], hiddenCount: 0 });
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

  it('loads referencing apps through the unified API', async () => {
    await act(async () => {
      root.render(
        React.createElement(ReferencedAppsPopover, {
          count: 1,
          resourceId: 'resource-1',
          resourceType: 'dataset',
          trigger: 'hover'
        })
      );
      await Promise.resolve();
    });

    expect(mocks.getReferencedApps).toHaveBeenCalledWith({
      resourceType: 'dataset',
      resourceId: 'resource-1'
    });
  });

  it('shows the standard error toast and clears loading when loading fails', async () => {
    const loadApps = vi.fn().mockRejectedValue(new Error(''));

    await act(async () => {
      root.render(
        React.createElement(ReferencedAppsPopover, {
          count: 1,
          resourceId: 'resource-1',
          resourceType: 'agent',
          loadApps,
          trigger: 'click'
        })
      );
      await Promise.resolve();
    });

    expect(loadApps).toHaveBeenCalledWith('resource-1');
    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'error',
      title: 'common:request_error'
    });
    expect(container.querySelector('[data-loading="false"]')).not.toBeNull();
  });
});
